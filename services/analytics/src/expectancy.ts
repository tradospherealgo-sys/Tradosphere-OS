import type { JournalEntryRecord } from './journal-source';
import { closedTradesOf } from './trade-stats';

// Expectancy: the standard "expected P&L per decisive trade" formula --
// winRate * avgWinAmount - lossRate * avgLossAmount -- computed over the
// same win-or-loss population Win Rate and Realized R:R use (breakeven
// trades excluded from both the rate and the amounts, since a trade that
// neither won nor lost carries no directional information to weight).
//
// This is deliberately a different number from Average Return
// (trade-stats.ts), which is mean realizedPnl across ALL closed trades
// including breakeven: Expectancy answers "what do wins and losses alone
// predict per decisive trade"; Average Return answers "what did every
// closed trade actually average, breakeven included". Both are genuine,
// independently useful stats, not duplicates -- hence two separate
// deliverables/columns. NULL when there are no decisive trades yet, same
// "no fabricated 0" contract as every other ratio here.
export function computeExpectancy(entries: JournalEntryRecord[]): number | null {
  const closed = closedTradesOf(entries);
  const wins = closed.filter((t) => t.realizedPnl > 0);
  const losses = closed.filter((t) => t.realizedPnl < 0);
  const decisive = wins.length + losses.length;
  if (decisive === 0) return null;

  const winRate = wins.length / decisive;
  const lossRate = losses.length / decisive;
  const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.realizedPnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.realizedPnl, 0) / losses.length) : 0;

  return winRate * avgWin - lossRate * avgLoss;
}
