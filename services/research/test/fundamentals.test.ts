import { describe, it, expect } from 'vitest';
import { analyzeFundamentals } from '../src/fundamentals';
import type { CompanyFinancials } from '../src/fundamentals-ingest';

describe('analyzeFundamentals (Sprint 4 task 4.3)', () => {
  it('returns a "strong" verdict for high growth, high margin, low leverage', () => {
    const financials: CompanyFinancials = {
      symbol: 'TCS',
      reportingPeriod: 'FY2026Q1',
      peRatio: 28,
      debtToEquity: 0.2,
      revenueGrowthYoyPct: 18,
      netProfitMarginPct: 20,
    };
    const result = analyzeFundamentals('TCS', financials);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok result');
    expect(result.verdict).toBe('strong');
    expect(result.symbol).toBe('TCS');
  });

  it('returns a "weak" verdict when revenue growth is negative', () => {
    const financials: CompanyFinancials = {
      symbol: 'ZOMATO',
      reportingPeriod: 'FY2026Q1',
      peRatio: 90,
      debtToEquity: 0.3,
      revenueGrowthYoyPct: -4,
      netProfitMarginPct: 2,
    };
    const result = analyzeFundamentals('ZOMATO', financials);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok result');
    expect(result.verdict).toBe('weak');
  });

  it('returns a "weak" verdict when debt-to-equity is high, even with positive growth', () => {
    const financials: CompanyFinancials = {
      symbol: 'ADANIENT',
      reportingPeriod: 'FY2026Q1',
      peRatio: 40,
      debtToEquity: 2.5,
      revenueGrowthYoyPct: 10,
      netProfitMarginPct: 8,
    };
    const result = analyzeFundamentals('ADANIENT', financials);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok result');
    expect(result.verdict).toBe('weak');
  });

  it('returns a "stable" verdict for middling numbers that are neither strong nor weak', () => {
    const financials: CompanyFinancials = {
      symbol: 'INFY',
      reportingPeriod: 'FY2026Q1',
      peRatio: 25,
      debtToEquity: 0.5,
      revenueGrowthYoyPct: 8,
      netProfitMarginPct: 12,
    };
    const result = analyzeFundamentals('INFY', financials);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok result');
    expect(result.verdict).toBe('stable');
  });

  it('returns an explicit gap, never a fabricated verdict, when no financials have been ingested', () => {
    const result = analyzeFundamentals('NEWLISTING', undefined);
    expect(result).toMatchObject({ status: 'gap', reason: 'missing_fundamentals' });
  });
});
