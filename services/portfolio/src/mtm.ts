import type { TradeRecordSource } from './trade-record-source';
import type { PriceSource } from './price-source';
import { computePositions, positionMarketValue, type Position, type PricedPosition } from './positions';
import { computeCashBalance, DEFAULT_STARTING_CASH } from './cash';
import { computeRealizedPnl, computeUnrealizedPnl } from './pnl';

export interface MtmResult {
  cashBalance: number;
  positionsValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalEquity: number;
  positions: Position[];
  // Same positions, paired with the exact price each one was valued at --
  // exposed so a single computeMarkToMarket call can also feed
  // performance.ts/allocation.ts/risk.ts without re-fetching prices (and
  // risking a second, different price for the same symbol within one
  // request).
  pricedPositions: PricedPosition[];
  // Open-position symbols PriceSource had no live tick for -- excluded from
  // both positionsValue and unrealizedPnl consistently (never silently
  // treated as zero), and surfaced here so callers can report the gap
  // (Delta charter rule 5).
  missingPriceSymbols: string[];
}

// Prices every open position exactly once against PriceSource. Shared by
// computeMarkToMarket below and by allocation.ts/risk.ts callers so
// unrealizedPnl, positionsValue, allocation, and risk exposure all agree on
// the same price for the same symbol within one request.
export async function pricePositions(
  positions: Position[],
  priceSource: PriceSource,
): Promise<{ priced: PricedPosition[]; missingPriceSymbols: string[] }> {
  const priced: PricedPosition[] = [];
  const missingPriceSymbols: string[] = [];

  for (const position of positions) {
    const latest = await priceSource.getLatestPrice(position.symbol);
    if (!latest) {
      missingPriceSymbols.push(position.symbol);
      continue;
    }
    priced.push({ position, currentPrice: latest.price });
  }

  return { priced, missingPriceSymbols };
}

// Signed aggregate market value of every priced position -- the exact
// Σ direction_i * currentPrice_i * quantity_i portfolio-schema.ts's
// positions_value column documents.
export function computePositionsValue(pricedPositions: PricedPosition[]): number {
  let total = 0;
  for (const priced of pricedPositions) {
    total += positionMarketValue(priced);
  }
  return total === 0 ? 0 : total;
}

// Decision D17's central reconciliation, run fresh on every call ("Daily
// MTM" and every read endpoint alike -- nothing here is cached): pulls every
// trade for a user through positions.ts/cash.ts/pnl.ts, prices every open
// position exactly once, and reports both the "P&L walk-forward" view
// (startingCash + realizedPnl + unrealizedPnl) and the "balance sheet" view
// (cashBalance + positionsValue) -- portfolio-schema.ts's doc comment proves
// these are algebraically identical; test/mtm.test.ts cross-checks that
// identity holds in real code, not just on paper.
export async function computeMarkToMarket(
  userId: string,
  tradeRecordSource: TradeRecordSource,
  priceSource: PriceSource,
  startingCash: number = DEFAULT_STARTING_CASH,
): Promise<MtmResult> {
  const trades = await tradeRecordSource.listByUser(userId);

  const positions = computePositions(trades);
  const cashBalance = computeCashBalance(trades, startingCash);
  const realizedPnl = computeRealizedPnl(trades);

  const { priced, missingPriceSymbols } = await pricePositions(positions, priceSource);
  const unrealizedPnl = computeUnrealizedPnl(priced);
  const positionsValue = computePositionsValue(priced);

  const totalEquity = startingCash + realizedPnl + unrealizedPnl;

  return {
    cashBalance,
    positionsValue,
    realizedPnl,
    unrealizedPnl,
    totalEquity,
    positions,
    pricedPositions: priced,
    missingPriceSymbols,
  };
}
