import { describe, it, expect } from 'vitest';
import { computeStrategyStats } from '../src/strategy-stats';
import type { JournalEntryRecord } from '../src/journal-source';

function entry(overrides: Partial<JournalEntryRecord> = {}): JournalEntryRecord {
  return {
    id: 'entry-1',
    userId: 'user-1',
    symbol: 'AAPL',
    side: 'buy',
    quantity: 10,
    fillPrice: 100,
    filledAtIso: '2026-01-15T10:00:00.000Z',
    recommendedDirection: null,
    recommendedRiskRewardRatio: null,
    cioVerdictLabel: null,
    status: 'open',
    exitPrice: null,
    exitAtIso: null,
    realizedPnl: null,
    ...overrides,
  };
}

function closed(overrides: Partial<JournalEntryRecord> = {}): JournalEntryRecord {
  return entry({
    status: 'closed',
    exitPrice: 110,
    exitAtIso: '2026-01-16T10:00:00.000Z',
    realizedPnl: 100,
    ...overrides,
  });
}

describe('computeStrategyStats', () => {
  it('returns an empty array for no entries', () => {
    expect(computeStrategyStats([])).toEqual([]);
  });

  it('buckets entries with neither cioVerdictLabel nor recommendedDirection into an explicit no_recommendation group', () => {
    const stats = computeStrategyStats([closed(), closed()]);
    expect(stats).toHaveLength(1);
    expect(stats[0].strategy).toEqual({ key: 'no_recommendation', cioVerdictLabel: null, recommendedDirection: null });
    expect(stats[0].totalTrades).toBe(2);
  });

  it('groups by the combination of cioVerdictLabel and recommendedDirection', () => {
    const entries = [
      closed({ cioVerdictLabel: 'bullish', recommendedDirection: 'long', realizedPnl: 100 }),
      closed({ cioVerdictLabel: 'bullish', recommendedDirection: 'long', realizedPnl: 200 }),
      closed({ cioVerdictLabel: 'bearish', recommendedDirection: 'short', realizedPnl: -50 }),
    ];
    const stats = computeStrategyStats(entries);
    expect(stats).toHaveLength(2);
    const bullishLong = stats.find((s) => s.strategy.key === 'bullish__long');
    expect(bullishLong?.totalTrades).toBe(2);
    expect(bullishLong?.totalRealizedPnl).toBe(300);
  });

  it('labels a genuinely mixed record (one field present, the other absent) explicitly rather than merging into no_recommendation', () => {
    const stats = computeStrategyStats([closed({ cioVerdictLabel: 'bullish', recommendedDirection: null })]);
    expect(stats[0].strategy.key).toBe('bullish__unknown_direction');

    const stats2 = computeStrategyStats([closed({ cioVerdictLabel: null, recommendedDirection: 'long' })]);
    expect(stats2[0].strategy.key).toBe('unknown_verdict__long');
  });

  it('sorts by totalTrades descending, breaking ties alphabetically by strategy key', () => {
    const entries = [
      closed({ cioVerdictLabel: 'neutral', recommendedDirection: 'long' }), // 1 trade, key 'neutral__long'
      closed({ cioVerdictLabel: 'bearish', recommendedDirection: 'short' }), // 1 trade, key 'bearish__short'
      closed({ cioVerdictLabel: 'bullish', recommendedDirection: 'long' }),
      closed({ cioVerdictLabel: 'bullish', recommendedDirection: 'long' }), // 2 trades, key 'bullish__long'
    ];
    const stats = computeStrategyStats(entries);
    expect(stats.map((s) => s.strategy.key)).toEqual(['bullish__long', 'bearish__short', 'neutral__long']);
  });

  it('computes winRate, averageReturn, and expectancy per strategy group via the shared helpers', () => {
    const entries = [
      closed({ cioVerdictLabel: 'bullish', recommendedDirection: 'long', realizedPnl: 100 }),
      closed({ cioVerdictLabel: 'bullish', recommendedDirection: 'long', realizedPnl: -50 }),
    ];
    const [stats] = computeStrategyStats(entries);
    expect(stats.winRate).toBe(0.5);
    expect(stats.averageReturn).toBe(25);
    expect(stats.expectancy).toBeCloseTo(0.5 * 100 - 0.5 * 50);
  });
});
