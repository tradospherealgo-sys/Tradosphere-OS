import type { JournalEntryRecord } from './journal-source';
import { computeTradeCounts, computeWinRate, computeAverageReturn, closedTradesOf } from './trade-stats';
import { computeExpectancy } from './expectancy';

// Decision D18 interpretation #1: journal_entries has no strategy_id /
// strategy_name column or FK to services/education's strategies table, so
// "Strategy Statistics" groups by the only real categorical proxy that
// exists -- cioVerdictLabel + recommendedDirection -- rather than inventing
// a strategy taxonomy the data doesn't have. Entries with NEITHER field
// populated (no CIO recommendation behind the trade at all) fall into an
// explicit 'no_recommendation' bucket, never dropped or silently merged
// into some other group.
export interface StrategyKey {
  key: string; // e.g. 'bullish__long', or 'no_recommendation'
  cioVerdictLabel: string | null;
  recommendedDirection: string | null;
}

export interface StrategyStats {
  strategy: StrategyKey;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  openTrades: number;
  totalRealizedPnl: number;
  winRate: number | null;
  averageReturn: number | null;
  expectancy: number | null;
}

function strategyKeyOf(entry: JournalEntryRecord): StrategyKey {
  if (entry.cioVerdictLabel === null && entry.recommendedDirection === null) {
    return { key: 'no_recommendation', cioVerdictLabel: null, recommendedDirection: null };
  }
  // A real (non-null) verdict/direction is used as-is; a genuinely mixed
  // case (one field present, the other absent -- possible since both are
  // independently nullable columns) is labeled explicitly rather than
  // silently coerced into 'no_recommendation'.
  const verdictPart = entry.cioVerdictLabel ?? 'unknown_verdict';
  const directionPart = entry.recommendedDirection ?? 'unknown_direction';
  return {
    key: `${verdictPart}__${directionPart}`,
    cioVerdictLabel: entry.cioVerdictLabel,
    recommendedDirection: entry.recommendedDirection,
  };
}

export function computeStrategyStats(entries: JournalEntryRecord[]): StrategyStats[] {
  const byStrategy = new Map<string, { strategy: StrategyKey; entries: JournalEntryRecord[] }>();

  for (const entry of entries) {
    const strategy = strategyKeyOf(entry);
    const existing = byStrategy.get(strategy.key);
    if (existing) {
      existing.entries.push(entry);
    } else {
      byStrategy.set(strategy.key, { strategy, entries: [entry] });
    }
  }

  const stats: StrategyStats[] = [];
  for (const { strategy, entries: groupEntries } of byStrategy.values()) {
    const counts = computeTradeCounts(groupEntries);
    const closed = closedTradesOf(groupEntries);
    const totalRealizedPnl = closed.reduce((sum, t) => sum + t.realizedPnl, 0);

    stats.push({
      strategy,
      ...counts,
      totalRealizedPnl,
      winRate: computeWinRate(groupEntries),
      averageReturn: computeAverageReturn(groupEntries),
      expectancy: computeExpectancy(groupEntries),
    });
  }

  // Largest group first -- the natural "most significant strategy" read
  // order for a UI table; ties broken alphabetically by key for a
  // deterministic, hand-verifiable order.
  stats.sort((a, b) => b.totalTrades - a.totalTrades || a.strategy.key.localeCompare(b.strategy.key));
  return stats;
}
