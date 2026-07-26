import { describe, it, expect } from 'vitest';
import { computeInstrumentAnalysis } from '../src/instrument-analysis';
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

function closed(symbol: string, realizedPnl: number): JournalEntryRecord {
  return entry({ symbol, status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl });
}

describe('computeInstrumentAnalysis', () => {
  it('returns an empty array for no entries', () => {
    expect(computeInstrumentAnalysis([])).toEqual([]);
  });

  it('groups entries by their own symbol', () => {
    const entries = [closed('AAPL', 100), closed('AAPL', -50), closed('TSLA', 200)];
    const stats = computeInstrumentAnalysis(entries);
    expect(stats).toHaveLength(2);
    const aapl = stats.find((s) => s.symbol === 'AAPL')!;
    expect(aapl.totalTrades).toBe(2);
    expect(aapl.winningTrades).toBe(1);
    expect(aapl.losingTrades).toBe(1);
    expect(aapl.totalRealizedPnl).toBe(50);
  });

  it('sorts most-traded instrument first, breaking ties alphabetically by symbol', () => {
    const entries = [
      closed('TSLA', 10),
      closed('MSFT', 10),
      closed('MSFT', 10),
      closed('AAPL', 10),
      closed('AAPL', 10),
    ];
    const stats = computeInstrumentAnalysis(entries);
    // AAPL and MSFT both have 2 trades (tie -> alphabetical), TSLA has 1.
    expect(stats.map((s) => s.symbol)).toEqual(['AAPL', 'MSFT', 'TSLA']);
  });

  it('computes winRate and averageReturn per instrument independently of other symbols', () => {
    const entries = [closed('AAPL', 100), closed('AAPL', 300), closed('TSLA', -100)];
    const stats = computeInstrumentAnalysis(entries);
    const aapl = stats.find((s) => s.symbol === 'AAPL')!;
    expect(aapl.winRate).toBe(1);
    expect(aapl.averageReturn).toBe(200);
    const tsla = stats.find((s) => s.symbol === 'TSLA')!;
    expect(tsla.winRate).toBe(0);
    expect(tsla.averageReturn).toBe(-100);
  });
});
