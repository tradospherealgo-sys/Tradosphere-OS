import type { JournalEntryRecord } from './journal-source';
import { SESSION_WINDOWS, sessionWindowOf, type SessionWindowKey } from './time-buckets';
import { computeTradeCounts, computeWinRate, computeAverageReturn, closedTradesOf } from './trade-stats';

export interface SessionStats {
  session: SessionWindowKey;
  label: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  openTrades: number;
  totalRealizedPnl: number;
  winRate: number | null;
  averageReturn: number | null;
}

// Decision D18 interpretation #2: buckets by UTC hour-of-day
// (time-buckets.ts's SESSION_WINDOWS) using each entry's own filledAtIso --
// not a specific exchange's local trading-session schedule, since no
// timezone or exchange-hours config exists anywhere in this codebase.
// Always returns exactly SESSION_WINDOWS.length rows, one per window, even
// when a window has zero trades (an empty session is a real, reportable
// fact -- never omitted, same "report the gap, don't hide it" contract
// every other module here uses).
export function computeSessionAnalysis(entries: JournalEntryRecord[]): SessionStats[] {
  const byWindow = new Map<SessionWindowKey, JournalEntryRecord[]>();
  for (const window of SESSION_WINDOWS) {
    byWindow.set(window.key, []);
  }

  for (const entry of entries) {
    const window = sessionWindowOf(entry.filledAtIso);
    byWindow.get(window)!.push(entry);
  }

  return SESSION_WINDOWS.map((window) => {
    const windowEntries = byWindow.get(window.key)!;
    const counts = computeTradeCounts(windowEntries);
    const closed = closedTradesOf(windowEntries);
    const totalRealizedPnl = closed.reduce((sum, t) => sum + t.realizedPnl, 0);

    return {
      session: window.key,
      label: window.label,
      ...counts,
      totalRealizedPnl,
      winRate: computeWinRate(windowEntries),
      averageReturn: computeAverageReturn(windowEntries),
    };
  });
}
