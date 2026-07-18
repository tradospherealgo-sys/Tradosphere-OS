import { describe, it, expect } from 'vitest';
import { validateFinancials, InvalidFinancialsError, type RawFinancialsRecord } from '../src/fundamentals-ingest';

// Task 4.3 exit criterion: "ingested financials validate before insert."
// Mirrors services/market-data/test/normalize.test.ts's coverage style for
// its InvalidTickError precedent.
describe('validateFinancials', () => {
  const valid: RawFinancialsRecord = {
    tradingSymbol: 'RELIANCE',
    reportingPeriod: 'FY2026Q1',
    peRatio: 24.5,
    debtToEquity: 0.4,
    revenueGrowthYoyPct: 12.3,
    netProfitMarginPct: 9.8,
  };

  it('maps a valid raw record to a trusted CompanyFinancials shape', () => {
    const result = validateFinancials(valid);
    expect(result).toEqual({
      symbol: 'RELIANCE',
      reportingPeriod: 'FY2026Q1',
      peRatio: 24.5,
      debtToEquity: 0.4,
      revenueGrowthYoyPct: 12.3,
      netProfitMarginPct: 9.8,
    });
  });

  it('rejects a blank/missing tradingSymbol', () => {
    expect(() => validateFinancials({ ...valid, tradingSymbol: '' })).toThrow(InvalidFinancialsError);
    expect(() => validateFinancials({ ...valid, tradingSymbol: undefined })).toThrow(InvalidFinancialsError);
  });

  it('rejects a blank/missing reportingPeriod', () => {
    expect(() => validateFinancials({ ...valid, reportingPeriod: '' })).toThrow(InvalidFinancialsError);
    expect(() => validateFinancials({ ...valid, reportingPeriod: undefined })).toThrow(InvalidFinancialsError);
  });

  it('rejects a negative or non-finite peRatio', () => {
    expect(() => validateFinancials({ ...valid, peRatio: -1 })).toThrow(InvalidFinancialsError);
    expect(() => validateFinancials({ ...valid, peRatio: NaN })).toThrow(InvalidFinancialsError);
    expect(() => validateFinancials({ ...valid, peRatio: undefined })).toThrow(InvalidFinancialsError);
  });

  it('rejects a negative or non-finite debtToEquity', () => {
    expect(() => validateFinancials({ ...valid, debtToEquity: -0.1 })).toThrow(InvalidFinancialsError);
    expect(() => validateFinancials({ ...valid, debtToEquity: Infinity })).toThrow(InvalidFinancialsError);
  });

  it('rejects a non-finite revenueGrowthYoyPct (negative growth itself is valid)', () => {
    expect(() => validateFinancials({ ...valid, revenueGrowthYoyPct: NaN })).toThrow(InvalidFinancialsError);
    expect(() => validateFinancials({ ...valid, revenueGrowthYoyPct: -5 })).not.toThrow();
  });

  it('rejects a non-finite netProfitMarginPct', () => {
    expect(() => validateFinancials({ ...valid, netProfitMarginPct: undefined })).toThrow(InvalidFinancialsError);
  });
});
