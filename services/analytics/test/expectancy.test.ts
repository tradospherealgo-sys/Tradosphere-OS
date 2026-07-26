import { describe, it, expect } from 'vitest';
import { computeExpectancy } from '../src/expectancy';
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

describe('computeExpectancy', () => {
  it('returns null when there are no decisive (win-or-loss) trades', () => {
    expect(computeExpectancy([])).toBeNull();
    expect(computeExpectancy([closed({ realizedPnl: 0 })])).toBeNull();
    expect(computeExpectancy([entry({ status: 'open' })])).toBeNull();
  });

  it('computes winRate * avgWin - lossRate * avgLoss over the decisive population', () => {
    const entries = [
      closed({ realizedPnl: 200 }), // win
      closed({ realizedPnl: 100 }), // win -> avgWin = 150
      closed({ realizedPnl: -50 }), // loss -> avgLoss = 50
    ];
    // winRate = 2/3, lossRate = 1/3
    const expected = (2 / 3) * 150 - (1 / 3) * 50;
    expect(computeExpectancy(entries)).toBeCloseTo(expected);
  });

  it('excludes breakeven trades from the decisive denominator entirely', () => {
    const entries = [closed({ realizedPnl: 100 }), closed({ realizedPnl: -100 }), closed({ realizedPnl: 0 })];
    // decisive = 2 (breakeven excluded); winRate=0.5, avgWin=100; lossRate=0.5, avgLoss=100
    expect(computeExpectancy(entries)).toBeCloseTo(0.5 * 100 - 0.5 * 100);
  });

  it('handles an all-wins population (lossRate and avgLoss both 0)', () => {
    const entries = [closed({ realizedPnl: 100 }), closed({ realizedPnl: 300 })];
    expect(computeExpectancy(entries)).toBe(200); // winRate=1, avgWin=200, lossRate=0
  });

  it('handles an all-losses population (winRate and avgWin both 0)', () => {
    const entries = [closed({ realizedPnl: -100 }), closed({ realizedPnl: -300 })];
    expect(computeExpectancy(entries)).toBe(-200); // lossRate=1, avgLoss=200
  });
});
