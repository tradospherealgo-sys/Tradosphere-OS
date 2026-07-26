import { describe, it, expect } from 'vitest';
import { computePlannedRiskRewardRatio, computeRealizedRiskRewardRatio } from '../src/risk-reward';
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

describe('computePlannedRiskRewardRatio', () => {
  it('returns null when no entries carry a recommendedRiskRewardRatio', () => {
    expect(computePlannedRiskRewardRatio([entry(), entry()])).toBeNull();
  });

  it('means recommendedRiskRewardRatio across every entry that has one, open or closed', () => {
    const entries = [
      entry({ recommendedRiskRewardRatio: 2 }),
      closed({ recommendedRiskRewardRatio: 4 }),
      entry({ recommendedRiskRewardRatio: null }),
    ];
    expect(computePlannedRiskRewardRatio(entries)).toBe(3);
  });

  it('ignores entries where the field is null rather than treating them as 0', () => {
    const entries = [entry({ recommendedRiskRewardRatio: 2 }), entry({ recommendedRiskRewardRatio: null })];
    expect(computePlannedRiskRewardRatio(entries)).toBe(2);
  });
});

describe('computeRealizedRiskRewardRatio', () => {
  it('returns null when there are no losing trades', () => {
    expect(computeRealizedRiskRewardRatio([closed({ realizedPnl: 100 })])).toBeNull();
  });

  it('returns null when there are no winning trades', () => {
    expect(computeRealizedRiskRewardRatio([closed({ realizedPnl: -50 })])).toBeNull();
  });

  it('returns null when there are no closed trades at all', () => {
    expect(computeRealizedRiskRewardRatio([entry({ status: 'open' })])).toBeNull();
  });

  it('divides the average winning trade by the average losing trade\'s absolute value', () => {
    const entries = [
      closed({ realizedPnl: 200 }),
      closed({ realizedPnl: 100 }), // avgWin = 150
      closed({ realizedPnl: -50 }), // avgLoss = |-50| = 50
    ];
    expect(computeRealizedRiskRewardRatio(entries)).toBe(150 / 50);
  });

  it('excludes breakeven trades from both averages', () => {
    const entries = [closed({ realizedPnl: 100 }), closed({ realizedPnl: -50 }), closed({ realizedPnl: 0 })];
    expect(computeRealizedRiskRewardRatio(entries)).toBe(100 / 50);
  });
});
