import { describe, it, expect } from 'vitest';
import { computePerformanceMetrics } from '../src/performance';
import type { MtmResult } from '../src/mtm';

function mtmResult(overrides: Partial<MtmResult> = {}): MtmResult {
  return {
    cashBalance: 0,
    positionsValue: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    totalEquity: 0,
    positions: [],
    pricedPositions: [],
    missingPriceSymbols: [],
    ...overrides,
  };
}

describe('computePerformanceMetrics', () => {
  it('reports zero return when totalEquity equals startingCash', () => {
    const metrics = computePerformanceMetrics(mtmResult({ totalEquity: 100_000 }), 100_000);
    expect(metrics).toEqual({
      startingCash: 100_000,
      totalEquity: 100_000,
      totalReturn: 0,
      totalReturnPct: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
    });
  });

  it('computes a positive totalReturn and totalReturnPct when equity has grown', () => {
    const metrics = computePerformanceMetrics(
      mtmResult({ totalEquity: 110_000, realizedPnl: 6_000, unrealizedPnl: 4_000 }),
      100_000,
    );
    expect(metrics.totalReturn).toBe(10_000);
    expect(metrics.totalReturnPct).toBeCloseTo(0.1);
    expect(metrics.realizedPnl).toBe(6_000);
    expect(metrics.unrealizedPnl).toBe(4_000);
  });

  it('computes a negative totalReturn and totalReturnPct when equity has shrunk', () => {
    const metrics = computePerformanceMetrics(mtmResult({ totalEquity: 90_000 }), 100_000);
    expect(metrics.totalReturn).toBe(-10_000);
    expect(metrics.totalReturnPct).toBeCloseTo(-0.1);
  });

  it('does not divide by zero when startingCash is 0 -- returns 0% rather than Infinity/NaN', () => {
    const metrics = computePerformanceMetrics(mtmResult({ totalEquity: 500 }), 0);
    expect(metrics.totalReturnPct).toBe(0);
    expect(metrics.totalReturn).toBe(500);
  });
});
