import { describe, it, expect } from 'vitest';
import { computeSessionAnalysis } from '../src/session-analysis';
import { SESSION_WINDOWS } from '../src/time-buckets';
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

function closed(filledAtIso: string, realizedPnl: number): JournalEntryRecord {
  return entry({ filledAtIso, status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl });
}

describe('computeSessionAnalysis', () => {
  it('always returns exactly one row per SESSION_WINDOWS entry, even with no trades at all', () => {
    const result = computeSessionAnalysis([]);
    expect(result).toHaveLength(SESSION_WINDOWS.length);
    expect(result.map((r) => r.session)).toEqual(SESSION_WINDOWS.map((w) => w.key));
    for (const row of result) {
      expect(row.totalTrades).toBe(0);
      expect(row.winRate).toBeNull();
      expect(row.averageReturn).toBeNull();
    }
  });

  it('carries each window\'s human-readable label through from SESSION_WINDOWS', () => {
    const result = computeSessionAnalysis([]);
    expect(result.find((r) => r.session === 'h00_06')?.label).toBe('00:00-06:00 UTC');
  });

  it('buckets a trade by the UTC hour of its own filledAtIso', () => {
    const entries = [
      closed('2026-01-01T03:00:00.000Z', 100), // 03:00 -> h00_06
      closed('2026-01-01T09:00:00.000Z', -50), // 09:00 -> h06_12
      closed('2026-01-01T21:00:00.000Z', 200), // 21:00 -> h18_24
    ];
    const result = computeSessionAnalysis(entries);
    expect(result.find((r) => r.session === 'h00_06')?.totalTrades).toBe(1);
    expect(result.find((r) => r.session === 'h06_12')?.totalTrades).toBe(1);
    expect(result.find((r) => r.session === 'h12_18')?.totalTrades).toBe(0);
    expect(result.find((r) => r.session === 'h18_24')?.totalTrades).toBe(1);
  });

  it('computes winRate/averageReturn/totalRealizedPnl per window from only that window\'s trades', () => {
    const entries = [
      closed('2026-01-01T02:00:00.000Z', 100),
      closed('2026-01-01T03:00:00.000Z', -50),
      closed('2026-01-01T09:00:00.000Z', 300),
    ];
    const result = computeSessionAnalysis(entries);
    const early = result.find((r) => r.session === 'h00_06')!;
    expect(early.totalTrades).toBe(2);
    expect(early.winRate).toBe(0.5);
    expect(early.totalRealizedPnl).toBe(50);

    const midMorning = result.find((r) => r.session === 'h06_12')!;
    expect(midMorning.totalTrades).toBe(1);
    expect(midMorning.winRate).toBe(1);
    expect(midMorning.averageReturn).toBe(300);
  });
});
