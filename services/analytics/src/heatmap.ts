import type { JournalEntryRecord } from './journal-source';
import { SESSION_WINDOWS, sessionWindowOf, type SessionWindowKey } from './time-buckets';
import { computeWinRate, closedTradesOf } from './trade-stats';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export type DayOfWeek = (typeof DAY_NAMES)[number];

export interface HeatmapCell {
  dayOfWeek: DayOfWeek;
  session: SessionWindowKey;
  sessionLabel: string;
  totalTrades: number;
  totalRealizedPnl: number;
  winRate: number | null;
}

// Day-of-week (UTC) x session-window (time-buckets.ts's SESSION_WINDOWS) --
// the two real, non-fabricated time dimensions Analytics has for every
// entry's own filledAtIso, the same UTC-clock-only reasoning
// session-analysis.ts uses. Always returns all 7*4=28 cells, even when a
// cell has zero trades (a genuinely quiet day/session is a real fact, not
// an omission) -- same "report the gap, don't hide it" contract every
// other module here uses.
export function computeHeatmap(entries: JournalEntryRecord[]): HeatmapCell[] {
  const buckets = new Map<string, JournalEntryRecord[]>();
  for (const day of DAY_NAMES) {
    for (const window of SESSION_WINDOWS) {
      buckets.set(`${day}__${window.key}`, []);
    }
  }

  for (const entry of entries) {
    const date = new Date(entry.filledAtIso);
    const day = DAY_NAMES[date.getUTCDay()];
    const session = sessionWindowOf(entry.filledAtIso);
    buckets.get(`${day}__${session}`)!.push(entry);
  }

  const cells: HeatmapCell[] = [];
  for (const day of DAY_NAMES) {
    for (const window of SESSION_WINDOWS) {
      const cellEntries = buckets.get(`${day}__${window.key}`)!;
      const closed = closedTradesOf(cellEntries);

      cells.push({
        dayOfWeek: day,
        session: window.key,
        sessionLabel: window.label,
        totalTrades: cellEntries.length,
        totalRealizedPnl: closed.reduce((sum, t) => sum + t.realizedPnl, 0),
        winRate: computeWinRate(cellEntries),
      });
    }
  }

  return cells;
}
