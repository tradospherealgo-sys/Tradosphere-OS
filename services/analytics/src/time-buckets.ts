// Shared time-bucketing helpers used by monthly-reports.ts (calendar-month
// grouping) and session-analysis.ts/heatmap.ts (hour-of-day grouping).
// Decision D18: both bucket on the UTC clock, read directly off each
// trade's own filledAtIso -- never a local/exchange timezone, since no
// timezone or exchange-hours config exists anywhere in this codebase to
// justify inventing one (the same "don't fabricate data that isn't there"
// reasoning Delta charter rule 5 applies to trading data, applied here to
// configuration).

export interface MonthBucket {
  key: string; // e.g. '2026-01' -- sortable and human-readable as-is
  year: number;
  month: number; // 1-12
}

// UTC calendar-month key for a trade's filledAtIso -- the grouping key
// monthly-reports.ts uses to produce one report per named period (e.g.
// "January 2026") rather than a single all-time blob.
export function monthBucketOf(iso: string): MonthBucket {
  const date = new Date(iso);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const key = `${year}-${String(month).padStart(2, '0')}`;
  return { key, year, month };
}

// Four fixed, equal-width UTC-hour windows -- a deliberate, documented,
// round-number default (same "explicitly named, not derived from data"
// reasoning trade-distribution.ts's DEFAULT_BUCKET_COUNT uses), NOT a
// specific exchange's local trading-session schedule (e.g. NSE's
// 09:15-15:30 IST) -- see Decision D18 interpretation #2. Labels are
// deliberately neutral clock ranges, not exchange/region names, so nothing
// here implies real exchange-hours data that was never configured.
export const SESSION_WINDOWS = [
  { key: 'h00_06', label: '00:00-06:00 UTC', startHour: 0, endHour: 6 },
  { key: 'h06_12', label: '06:00-12:00 UTC', startHour: 6, endHour: 12 },
  { key: 'h12_18', label: '12:00-18:00 UTC', startHour: 12, endHour: 18 },
  { key: 'h18_24', label: '18:00-24:00 UTC', startHour: 18, endHour: 24 },
] as const;

export type SessionWindowKey = (typeof SESSION_WINDOWS)[number]['key'];

// Which of the four fixed UTC-hour windows a trade's filledAtIso falls in.
// Every hour 0-23 maps to exactly one window (0-5 -> h00_06, 6-11 ->
// h06_12, 12-17 -> h12_18, 18-23 -> h18_24) -- there is no fifth
// "unmatched" case by construction.
export function sessionWindowOf(iso: string): SessionWindowKey {
  const hour = new Date(iso).getUTCHours();
  const window = SESSION_WINDOWS.find((w) => hour >= w.startHour && hour < w.endHour);
  // Unreachable given SESSION_WINDOWS covers every hour 0-23 -- TypeScript
  // can't prove that from .find()'s return type, so this throws loudly
  // rather than silently returning a wrong bucket if that invariant is ever
  // broken by a future edit.
  if (!window) throw new Error(`unreachable: hour ${hour} matched no session window`);
  return window.key;
}
