import { describe, it, expect } from 'vitest';
import { computeTradeDistribution, DEFAULT_BUCKET_COUNT } from '../src/trade-distribution';
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

function closed(realizedPnl: number): JournalEntryRecord {
  return entry({ status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl });
}

describe('DEFAULT_BUCKET_COUNT', () => {
  it('defaults to 10', () => {
    expect(DEFAULT_BUCKET_COUNT).toBe(10);
  });
});

describe('computeTradeDistribution', () => {
  it('returns empty buckets and null min/max when there are no closed trades', () => {
    expect(computeTradeDistribution([])).toEqual({ buckets: [], minPnl: null, maxPnl: null });
    expect(computeTradeDistribution([entry({ status: 'open' })])).toEqual({
      buckets: [],
      minPnl: null,
      maxPnl: null,
    });
  });

  it('collapses to a single bucket when every closed trade has the identical realizedPnl', () => {
    const result = computeTradeDistribution([closed(100), closed(100), closed(100)]);
    expect(result.minPnl).toBe(100);
    expect(result.maxPnl).toBe(100);
    expect(result.buckets).toEqual([{ rangeStart: 100, rangeEnd: 100, count: 3 }]);
  });

  it('splits a real P&L range into bucketCount equal-width buckets and clamps the max value into the last one', () => {
    const entries = [closed(-100), closed(-50), closed(0), closed(50), closed(100)];
    const result = computeTradeDistribution(entries, 5);

    expect(result.minPnl).toBe(-100);
    expect(result.maxPnl).toBe(100);
    expect(result.buckets).toHaveLength(5);
    expect(result.buckets).toEqual([
      { rangeStart: -100, rangeEnd: -60, count: 1 },
      { rangeStart: -60, rangeEnd: -20, count: 1 },
      { rangeStart: -20, rangeEnd: 20, count: 1 },
      { rangeStart: 20, rangeEnd: 60, count: 1 },
      { rangeStart: 60, rangeEnd: 100, count: 1 },
    ]);
  });

  it('uses DEFAULT_BUCKET_COUNT when no bucketCount argument is given', () => {
    const entries = [closed(-100), closed(100)];
    const result = computeTradeDistribution(entries);
    expect(result.buckets).toHaveLength(DEFAULT_BUCKET_COUNT);
  });

  it('groups multiple trades landing in the same sub-range into one bucket count', () => {
    const entries = [closed(1), closed(2), closed(3), closed(90)];
    const result = computeTradeDistribution(entries, 2);
    // min=1, max=90, width=44.5 -> bucket0 [1,45.5), bucket1 [45.5,90]
    expect(result.buckets[0].count).toBe(3);
    expect(result.buckets[1].count).toBe(1);
  });
});
