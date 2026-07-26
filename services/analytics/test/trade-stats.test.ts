import { describe, it, expect } from 'vitest';
import {
  closedTradesOf,
  computeTradeCounts,
  computeWinRate,
  computeAverageReturn,
  computeAverageReturnPct,
} from '../src/trade-stats';
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

describe('closedTradesOf', () => {
  it('returns an empty array for no entries', () => {
    expect(closedTradesOf([])).toEqual([]);
  });

  it('excludes open trades', () => {
    expect(closedTradesOf([entry({ status: 'open' })])).toEqual([]);
  });

  it('includes a closed trade with all three outcome fields set', () => {
    const trade = closed();
    expect(closedTradesOf([trade])).toEqual([trade]);
  });

  it('excludes a trade marked closed but missing realizedPnl (defensive, inconsistent record)', () => {
    const trade = entry({ status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: null });
    expect(closedTradesOf([trade])).toEqual([]);
  });
});

describe('computeTradeCounts', () => {
  it('returns all zeros for no entries', () => {
    expect(computeTradeCounts([])).toEqual({
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      breakevenTrades: 0,
      openTrades: 0,
    });
  });

  it('classifies wins, losses, and breakeven purely by realizedPnl sign', () => {
    const entries = [
      closed({ realizedPnl: 100 }),
      closed({ realizedPnl: -50 }),
      closed({ realizedPnl: 0 }),
      entry({ status: 'open' }),
    ];
    expect(computeTradeCounts(entries)).toEqual({
      totalTrades: 4,
      winningTrades: 1,
      losingTrades: 1,
      breakevenTrades: 1,
      openTrades: 1,
    });
  });

  it('counts every non-closed entry as open, regardless of totalTrades', () => {
    const entries = [entry({ status: 'open' }), entry({ status: 'open' }), closed()];
    const counts = computeTradeCounts(entries);
    expect(counts.totalTrades).toBe(3);
    expect(counts.openTrades).toBe(2);
  });
});

describe('computeWinRate', () => {
  it('returns null when there are no entries', () => {
    expect(computeWinRate([])).toBeNull();
  });

  it('returns null when only open trades exist', () => {
    expect(computeWinRate([entry({ status: 'open' })])).toBeNull();
  });

  it('returns null when only breakeven trades exist (no decisive trades)', () => {
    expect(computeWinRate([closed({ realizedPnl: 0 })])).toBeNull();
  });

  it('excludes breakeven trades from the denominator', () => {
    const entries = [closed({ realizedPnl: 100 }), closed({ realizedPnl: -50 }), closed({ realizedPnl: 0 })];
    // 1 win / (1 win + 1 loss) = 0.5 -- the breakeven trade doesn't count.
    expect(computeWinRate(entries)).toBe(0.5);
  });

  it('computes 1.0 when every decisive trade won', () => {
    const entries = [closed({ realizedPnl: 100 }), closed({ realizedPnl: 50 })];
    expect(computeWinRate(entries)).toBe(1);
  });
});

describe('computeAverageReturn', () => {
  it('returns null when there are no closed trades', () => {
    expect(computeAverageReturn([entry({ status: 'open' })])).toBeNull();
  });

  it('means realizedPnl across all closed trades, including breakeven', () => {
    const entries = [closed({ realizedPnl: 300 }), closed({ realizedPnl: -100 }), closed({ realizedPnl: 0 })];
    expect(computeAverageReturn(entries)).toBeCloseTo((300 - 100 + 0) / 3);
  });
});

describe('computeAverageReturnPct', () => {
  it('returns null when there are no closed trades', () => {
    expect(computeAverageReturnPct([entry({ status: 'open' })])).toBeNull();
  });

  it('means each trade\'s own realizedPnl / (fillPrice * quantity)', () => {
    const entries = [
      closed({ fillPrice: 100, quantity: 10, realizedPnl: 100 }), // 100/1000 = 0.1
      closed({ fillPrice: 50, quantity: 4, realizedPnl: -20 }), // -20/200 = -0.1
    ];
    expect(computeAverageReturnPct(entries)).toBeCloseTo((0.1 - 0.1) / 2);
  });

  it('excludes a trade whose committed capital (fillPrice * quantity) is exactly 0', () => {
    const entries = [
      closed({ fillPrice: 0, quantity: 10, realizedPnl: 50 }), // committed = 0, excluded
      closed({ fillPrice: 100, quantity: 1, realizedPnl: 20 }), // 20/100 = 0.2
    ];
    expect(computeAverageReturnPct(entries)).toBeCloseTo(0.2);
  });

  it('returns null when every closed trade has zero committed capital', () => {
    const entries = [closed({ fillPrice: 0, quantity: 10, realizedPnl: 0 })];
    expect(computeAverageReturnPct(entries)).toBeNull();
  });
});
