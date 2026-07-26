import type { JournalEntryRecord } from './journal-source';

// A journal entry that has actually closed -- realizedPnl/exitPrice/
// exitAtIso are guaranteed non-null (services/journal's recordOutcome()
// writes all three atomically, per Decision D16, and refuses to reopen an
// already-closed entry), so every stat module below can trust these fields
// without a null check on every access.
export interface ClosedTrade extends JournalEntryRecord {
  status: 'closed';
  exitPrice: number;
  exitAtIso: string;
  realizedPnl: number;
}

export function closedTradesOf(entries: JournalEntryRecord[]): ClosedTrade[] {
  return entries.filter(
    (e): e is ClosedTrade => e.status === 'closed' && e.realizedPnl !== null && e.exitPrice !== null && e.exitAtIso !== null,
  );
}

export interface TradeCounts {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  openTrades: number;
}

// Wins/losses/breakeven are judged only against realizedPnl -- a trade
// with realizedPnl === 0 is a genuine breakeven, not a loss, matching
// analytics-schema.ts's own "zero over zero trades is a true zero" comment
// generalized to "zero on one real trade is also a true zero, not a gap".
export function computeTradeCounts(entries: JournalEntryRecord[]): TradeCounts {
  const closed = closedTradesOf(entries);
  let winningTrades = 0;
  let losingTrades = 0;
  let breakevenTrades = 0;

  for (const trade of closed) {
    if (trade.realizedPnl > 0) winningTrades++;
    else if (trade.realizedPnl < 0) losingTrades++;
    else breakevenTrades++;
  }

  const openTrades = entries.length - closed.length;

  return {
    totalTrades: entries.length,
    winningTrades,
    losingTrades,
    breakevenTrades,
    openTrades,
  };
}

// Win Rate: winningTrades / (winningTrades + losingTrades). Breakeven
// trades are excluded from the denominator -- the same judgment call a
// hand calculation would make: a trade that neither won nor lost shouldn't
// drag the ratio toward either extreme. NULL (never a fabricated 0) when
// there are no decisive (win-or-loss) trades yet, mirroring
// analytics-schema.ts's win_rate column contract.
export function computeWinRate(entries: JournalEntryRecord[]): number | null {
  const { winningTrades, losingTrades } = computeTradeCounts(entries);
  const decisive = winningTrades + losingTrades;
  if (decisive === 0) return null;
  return winningTrades / decisive;
}

// Average Return: mean realizedPnl (currency terms) across ALL closed
// trades, including breakeven (which contribute exactly 0). NULL when
// there are no closed trades -- never a fabricated 0.
export function computeAverageReturn(entries: JournalEntryRecord[]): number | null {
  const closed = closedTradesOf(entries);
  if (closed.length === 0) return null;
  const total = closed.reduce((sum, t) => sum + t.realizedPnl, 0);
  return total / closed.length;
}

// Average Return %: mean of each closed trade's own realizedPnl divided by
// the capital actually committed to that specific trade (fillPrice *
// quantity) -- not portfolio starting cash, which Analytics has no port to
// read at all (Decision D18: Analytics never imports services/portfolio,
// only its two read ports). NULL when there are no closed trades; a trade
// whose committed capital is exactly 0 is excluded from the average rather
// than dividing by zero, so one degenerate row doesn't null out the whole
// stat.
export function computeAverageReturnPct(entries: JournalEntryRecord[]): number | null {
  const closed = closedTradesOf(entries);
  const pcts: number[] = [];
  for (const trade of closed) {
    const committed = trade.fillPrice * trade.quantity;
    if (committed === 0) continue;
    pcts.push(trade.realizedPnl / committed);
  }
  if (pcts.length === 0) return null;
  return pcts.reduce((sum, p) => sum + p, 0) / pcts.length;
}
