import { describe, it, expect } from 'vitest';
import { computeMonthlyReports } from '../src/monthly-reports';
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

describe('computeMonthlyReports', () => {
  it('returns an empty array for no entries', () => {
    expect(computeMonthlyReports([])).toEqual([]);
  });

  it('groups entries into one report per UTC calendar month of filledAtIso', () => {
    const entries = [
      closed({ filledAtIso: '2026-01-05T10:00:00.000Z', realizedPnl: 100 }),
      closed({ filledAtIso: '2026-01-20T10:00:00.000Z', realizedPnl: -50 }),
      closed({ filledAtIso: '2026-02-01T10:00:00.000Z', realizedPnl: 200 }),
    ];
    const reports = computeMonthlyReports(entries);
    expect(reports).toHaveLength(2);
    expect(reports[0].month.key).toBe('2026-01');
    expect(reports[0].totalTrades).toBe(2);
    expect(reports[0].totalRealizedPnl).toBe(50);
    expect(reports[1].month.key).toBe('2026-02');
    expect(reports[1].totalTrades).toBe(1);
    expect(reports[1].totalRealizedPnl).toBe(200);
  });

  it('sorts reports chronologically ascending regardless of input order', () => {
    const entries = [
      closed({ filledAtIso: '2026-03-01T00:00:00.000Z' }),
      closed({ filledAtIso: '2026-01-01T00:00:00.000Z' }),
      closed({ filledAtIso: '2026-02-01T00:00:00.000Z' }),
    ];
    const reports = computeMonthlyReports(entries);
    expect(reports.map((r) => r.month.key)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('attributes a trade entirely to the month it was FILLED in, even if it closed in a later month', () => {
    const entries = [
      closed({
        filledAtIso: '2026-01-28T10:00:00.000Z',
        exitAtIso: '2026-02-03T10:00:00.000Z',
        realizedPnl: 100,
      }),
    ];
    const reports = computeMonthlyReports(entries);
    expect(reports).toHaveLength(1);
    expect(reports[0].month.key).toBe('2026-01');
  });

  it('computes the full per-month stat set (counts, winRate, expectancy, R:R) via the same shared helpers as the rollup', () => {
    const entries = [
      closed({ filledAtIso: '2026-01-05T10:00:00.000Z', realizedPnl: 100, recommendedRiskRewardRatio: 2 }),
      closed({ filledAtIso: '2026-01-06T10:00:00.000Z', realizedPnl: -50 }),
      entry({ filledAtIso: '2026-01-07T10:00:00.000Z', status: 'open' }),
    ];
    const [report] = computeMonthlyReports(entries);
    expect(report.totalTrades).toBe(3);
    expect(report.winningTrades).toBe(1);
    expect(report.losingTrades).toBe(1);
    expect(report.openTrades).toBe(1);
    expect(report.winRate).toBe(0.5);
    expect(report.plannedRiskRewardRatio).toBe(2);
    expect(report.expectancy).toBeCloseTo(0.5 * 100 - 0.5 * 50);
  });
});
