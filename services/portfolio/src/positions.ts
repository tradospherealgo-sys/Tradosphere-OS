import type { OrderSide } from '@tradosphere/shared-types';
import type { TradeRecord } from './trade-record-source';

export type PositionDirection = 'long' | 'short';

export interface Position {
  symbol: string;
  direction: PositionDirection;
  quantity: number;
  averageEntryPrice: number;
}

// A position priced against a live tick -- the one snapshot mtm.ts,
// pnl.ts, allocation.ts, and risk.ts all share, so a single PriceSource
// call per symbol feeds every downstream number instead of each module
// re-fetching (and risking two different prices for the same symbol
// within one request).
export interface PricedPosition {
  position: Position;
  currentPrice: number;
}

// +1 for a 'buy' fill (opens/adds to a long), -1 for a 'sell' fill (opens/
// adds to a short) -- same convention services/journal/src/pnl.ts already
// established for calculateRealizedPnl, reused here rather than
// reinvented so "long profits as price rises, short profits as price
// falls" means the same thing everywhere in the codebase.
export function directionSign(side: OrderSide): 1 | -1 {
  return side === 'buy' ? 1 : -1;
}

// Same sign convention, applied to an already-aggregated position's
// direction rather than a single trade's side.
export function positionSign(direction: PositionDirection): 1 | -1 {
  return direction === 'long' ? 1 : -1;
}

// Signed current market value of one priced position:
// direction * currentPrice * quantity. Shared by mtm.ts's positionsValue,
// allocation.ts's per-symbol market value, and risk.ts's exposure figures
// so all three agree on what "market value" means for a given position.
export function positionMarketValue(priced: PricedPosition): number {
  const value = positionSign(priced.position.direction) * priced.currentPrice * priced.position.quantity;
  return value === 0 ? 0 : value;
}

// Decision D17: net position per symbol, computed from OPEN trade records
// only, as a quantity-weighted average entry price. Trades already CLOSED
// no longer contribute to a position -- they're fully realized (pnl.ts
// reads their stored realizedPnl instead, never recomputing it). A symbol
// whose open trades net to exactly zero signed quantity (a fully-hedged
// wash) has no position and is omitted, not reported as a zero-quantity
// row.
export function computePositions(trades: TradeRecord[]): Position[] {
  const openTrades = trades.filter((trade) => trade.status === 'open');

  const bySymbol = new Map<string, TradeRecord[]>();
  for (const trade of openTrades) {
    const list = bySymbol.get(trade.symbol) ?? [];
    list.push(trade);
    bySymbol.set(trade.symbol, list);
  }

  const positions: Position[] = [];
  for (const [symbol, symbolTrades] of bySymbol) {
    let signedQuantity = 0;
    let totalQuantity = 0;
    let totalCost = 0;

    for (const trade of symbolTrades) {
      const sign = directionSign(trade.side);
      signedQuantity += sign * trade.quantity;
      totalQuantity += trade.quantity;
      totalCost += trade.quantity * trade.fillPrice;
    }

    if (signedQuantity === 0) continue;

    positions.push({
      symbol,
      direction: signedQuantity > 0 ? 'long' : 'short',
      quantity: Math.abs(signedQuantity),
      averageEntryPrice: totalCost / totalQuantity,
    });
  }

  return positions.sort((a, b) => a.symbol.localeCompare(b.symbol));
}
