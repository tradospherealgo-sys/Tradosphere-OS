import type { TradeRecord } from './trade-record-source';
import type { PricedPosition } from './positions';
import { positionSign } from './positions';

// Decision D17: realizedPnl is never recomputed here -- it is summed
// straight from journal_entries.realized_pnl (services/journal/src/pnl.ts's
// calculateRealizedPnl already computed and stored it, exactly once, at the
// moment the trade closed). Re-deriving the same number a second time would
// risk the two values silently drifting apart if either formula ever
// changed independently; summing the already-persisted value is what makes
// "P&L reconciles against journal entries for seeded test trades" true by
// construction, the same reasoning Decision D14 already applied to Fill
// pricing.
export function computeRealizedPnl(trades: TradeRecord[]): number {
  let total = 0;
  for (const trade of trades) {
    if (trade.status === 'closed' && trade.realizedPnl !== null) {
      total += trade.realizedPnl;
    }
  }
  return total === 0 ? 0 : total;
}

// Unrealized P&L per open position: direction*(currentPrice-averageEntryPrice)*quantity
// -- the same formula shape as services/journal/src/pnl.ts's
// calculateRealizedPnl, just fed a live price instead of an exit price.
// Takes already-priced positions (mtm.ts fetches each symbol's price
// exactly once and shares the snapshot) so this can never disagree with
// mtm.ts's positionsValue about what price was used for a given symbol.
export function computeUnrealizedPnl(pricedPositions: PricedPosition[]): number {
  let total = 0;
  for (const { position, currentPrice } of pricedPositions) {
    total += positionSign(position.direction) * (currentPrice - position.averageEntryPrice) * position.quantity;
  }
  return total === 0 ? 0 : total;
}
