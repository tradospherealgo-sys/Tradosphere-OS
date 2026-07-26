import type { JournalEntryRecord } from './journal-source';
import { monthBucketOf, type MonthBucket } from './time-buckets';
import {
  computeTradeCounts,
  computeWinRate,
  computeAverageReturn,
  computeAverageReturnPct,
  closedTradesOf,
} from './trade-stats';
import { computePlannedRiskRewardRatio, computeRealizedRiskRewardRatio } from './risk-reward';
import { computeExpectancy } from './expectancy';

export interface MonthlyReport {
  month: MonthBucket;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  openTrades: number;
  totalRealizedPnl: number;
  winRate: number | null;
  averageReturn: number | null;
  averageReturnPct: number | null;
  expectancy: number | null;
  plannedRiskRewardRatio: number | null;
  realizedRiskRewardRatio: number | null;
}

// Every entry is attributed to the UTC calendar month it was FILLED in
// (filledAtIso), regardless of when (or whether) it later closed -- one
// single, unambiguous timestamp per entry for month attribution, rather
// than splitting a trade's stats across the month it opened and the month
// it closed. A trade filled in January and closed in February is entirely
// a January trade for reporting purposes here. This is a deliberate,
// documented interpretation choice, in the same spirit as Decision D18's
// three named interpretation calls.
export function computeMonthlyReports(entries: JournalEntryRecord[]): MonthlyReport[] {
  const byMonth = new Map<string, { bucket: MonthBucket; entries: JournalEntryRecord[] }>();

  for (const entry of entries) {
    const bucket = monthBucketOf(entry.filledAtIso);
    const existing = byMonth.get(bucket.key);
    if (existing) {
      existing.entries.push(entry);
    } else {
      byMonth.set(bucket.key, { bucket, entries: [entry] });
    }
  }

  const reports: MonthlyReport[] = [];
  for (const { bucket, entries: monthEntries } of byMonth.values()) {
    const counts = computeTradeCounts(monthEntries);
    const closed = closedTradesOf(monthEntries);
    const totalRealizedPnl = closed.reduce((sum, t) => sum + t.realizedPnl, 0);

    reports.push({
      month: bucket,
      ...counts,
      totalRealizedPnl,
      winRate: computeWinRate(monthEntries),
      averageReturn: computeAverageReturn(monthEntries),
      averageReturnPct: computeAverageReturnPct(monthEntries),
      expectancy: computeExpectancy(monthEntries),
      plannedRiskRewardRatio: computePlannedRiskRewardRatio(monthEntries),
      realizedRiskRewardRatio: computeRealizedRiskRewardRatio(monthEntries),
    });
  }

  // Chronological order -- the natural read order for a report list, same
  // ascending-order convention services/portfolio's listByUser uses for
  // its own history.
  reports.sort((a, b) => a.month.key.localeCompare(b.month.key));
  return reports;
}
