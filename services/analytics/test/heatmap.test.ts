import { describe, it, expect } from 'vitest';
import { computeHeatmap } from '../src/heatmap';
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

describe('computeHeatmap', () => {
  it('always returns exactly 28 cells (7 days x 4 sessions), even with no trades', () => {
    const cells = computeHeatmap([]);
    expect(cells).toHaveLength(28);
    for (const cell of cells) {
      expect(cell.totalTrades).toBe(0);
      expect(cell.totalRealizedPnl).toBe(0);
      expect(cell.winRate).toBeNull();
    }
  });

  it('places a trade in the cell matching its own UTC day-of-week and session window', () => {
    // 2026-01-21 is a Wednesday; 14:00 UTC falls in h12_18.
    const cells = computeHeatmap([closed('2026-01-21T14:00:00.000Z', 100)]);
    const cell = cells.find((c) => c.dayOfWeek === 'wednesday' && c.session === 'h12_18')!;
    expect(cell.totalTrades).toBe(1);
    expect(cell.totalRealizedPnl).toBe(100);
    expect(cell.winRate).toBe(1);
    expect(cell.sessionLabel).toBe('12:00-18:00 UTC');

    // Every other cell stays empty.
    const others = cells.filter((c) => c !== cell);
    expect(others.every((c) => c.totalTrades === 0)).toBe(true);
  });

  it('aggregates multiple trades landing in the same day/session cell', () => {
    // Both fall on the same Wednesday, same h00_06 window.
    const cells = computeHeatmap([
      closed('2026-01-21T01:00:00.000Z', 100),
      closed('2026-01-21T02:00:00.000Z', -40),
    ]);
    const cell = cells.find((c) => c.dayOfWeek === 'wednesday' && c.session === 'h00_06')!;
    expect(cell.totalTrades).toBe(2);
    expect(cell.totalRealizedPnl).toBe(60);
    expect(cell.winRate).toBe(0.5);
  });
});
