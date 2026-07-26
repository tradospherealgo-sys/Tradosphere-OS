import { getEnvNumber } from '@tradosphere/config';
import type { TradeRecord } from './trade-record-source';
import { directionSign } from './positions';

// Decision D17: paper-trading needs a seeded cash balance, but Sprint 2's
// `users` table is completed, protected architecture (Principal's explicit
// "do not modify completed architecture" constraint for this sprint) -- so
// starting cash is a code/env constant, never a new schema column.
// Overridable via PORTFOLIO_STARTING_CASH for local tuning; defaults to a
// conventional $100,000 paper-trading seed, documented here rather than
// silently hardcoded wherever it happens to be used.
export const DEFAULT_STARTING_CASH = getEnvNumber('PORTFOLIO_STARTING_CASH', 100_000);

// Decision D17's cash ledger: every trade's OPEN leg applies
// -direction*fillPrice*quantity (buying spends cash; opening a short
// receives cash). A CLOSED trade's CLOSE leg additionally applies
// +direction*exitPrice*quantity on top (selling to close a long returns
// cash; buying back to cover a short spends cash). Together with pnl.ts's
// unrealizedPnl and mtm.ts's positionsValue, this is the exact ledger
// portfolio-schema.ts's doc comment proves reconciles to
// totalEquity = startingCash + realizedPnl + unrealizedPnl.
export function computeCashBalance(trades: TradeRecord[], startingCash: number = DEFAULT_STARTING_CASH): number {
  let cash = startingCash;

  for (const trade of trades) {
    const sign = directionSign(trade.side);

    // Open leg -- applies to every trade, open or closed.
    cash += -sign * trade.fillPrice * trade.quantity;

    // Close leg -- applies only once a trade has actually closed.
    if (trade.status === 'closed' && trade.exitPrice !== null) {
      cash += sign * trade.exitPrice * trade.quantity;
    }
  }

  return cash === 0 ? 0 : cash;
}
