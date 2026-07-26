import { describe, it, expect } from 'vitest';
import { computeRiskExposure } from '../src/risk';
import type { PricedPosition } from '../src/positions';

describe('computeRiskExposure', () => {
  it('returns all zeros for no priced positions', () => {
    expect(computeRiskExposure([], 100_000)).toEqual({
      grossExposure: 0,
      netExposure: 0,
      leverageRatio: 0,
      largestPositionPct: 0,
    });
  });

  it('computes gross as the sum of absolute exposure and net as the signed sum', () => {
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 }, currentPrice: 120 },
      { position: { symbol: 'TSLA', direction: 'short', quantity: 5, averageEntryPrice: 300 }, currentPrice: 250 },
    ];
    const risk = computeRiskExposure(priced, 100_000);
    // AAPL value +1200, TSLA value -1250
    expect(risk.grossExposure).toBe(2450);
    expect(risk.netExposure).toBe(-50);
  });

  it('nets long and short exposure of equal magnitude to a plain 0, not -0', () => {
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 }, currentPrice: 100 },
      { position: { symbol: 'TSLA', direction: 'short', quantity: 10, averageEntryPrice: 100 }, currentPrice: 100 },
    ];
    const risk = computeRiskExposure(priced, 100_000);
    expect(risk.grossExposure).toBe(2000);
    expect(Object.is(risk.netExposure, -0)).toBe(false);
    expect(risk.netExposure).toBe(0);
  });

  it('divides gross exposure by totalEquity for leverageRatio', () => {
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 }, currentPrice: 120 },
      { position: { symbol: 'TSLA', direction: 'short', quantity: 5, averageEntryPrice: 300 }, currentPrice: 250 },
    ];
    const risk = computeRiskExposure(priced, 100_000);
    expect(risk.leverageRatio).toBeCloseTo(2450 / 100_000);
  });

  it('does not divide by zero when totalEquity is 0 -- leverageRatio is 0, not Infinity', () => {
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 }, currentPrice: 120 },
    ];
    const risk = computeRiskExposure(priced, 0);
    expect(risk.leverageRatio).toBe(0);
  });

  it('reports the largest single position as a share of gross exposure', () => {
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 }, currentPrice: 120 },
      { position: { symbol: 'TSLA', direction: 'short', quantity: 5, averageEntryPrice: 300 }, currentPrice: 250 },
    ];
    const risk = computeRiskExposure(priced, 100_000);
    // TSLA's |value| (1250) is the largest of {1200, 1250}, over gross 2450
    expect(risk.largestPositionPct).toBeCloseTo(1250 / 2450);
  });

  it('does not divide by zero when gross exposure is 0 -- largestPositionPct is 0, not NaN', () => {
    expect(computeRiskExposure([], 100_000).largestPositionPct).toBe(0);
  });
});
