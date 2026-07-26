import { describe, it, expect } from 'vitest';
import { computeRiskAdjustedReturns } from '../src/risk-adjusted-returns';
import type { EquitySnapshotRecord } from '../src/equity-source';

function snapshot(totalEquity: number, asOfIso: string): EquitySnapshotRecord {
  return { totalEquity, asOfIso };
}

describe('computeRiskAdjustedReturns', () => {
  it('reports insufficientData with zero snapshots', () => {
    expect(computeRiskAdjustedReturns([])).toEqual({
      sharpeRatio: null,
      sortinoRatio: null,
      insufficientData: true,
    });
  });

  it('reports insufficientData with only one snapshot (zero period returns)', () => {
    const result = computeRiskAdjustedReturns([snapshot(100_000, '2026-01-01T00:00:00.000Z')]);
    expect(result.insufficientData).toBe(true);
    expect(result.sharpeRatio).toBeNull();
    expect(result.sortinoRatio).toBeNull();
  });

  it('reports insufficientData with only two snapshots (a single period return)', () => {
    const snapshots = [snapshot(100, '2026-01-01T00:00:00.000Z'), snapshot(110, '2026-01-02T00:00:00.000Z')];
    expect(computeRiskAdjustedReturns(snapshots).insufficientData).toBe(true);
  });

  it('skips a period whose starting equity is non-positive, which can push a 3-snapshot series back below the 2-return floor', () => {
    // periods: (100-0)/0 skipped entirely; (110-100)/100 = 0.1 kept -> only 1
    // real return despite 3 snapshots.
    const snapshots = [
      snapshot(0, '2026-01-01T00:00:00.000Z'),
      snapshot(100, '2026-01-02T00:00:00.000Z'),
      snapshot(110, '2026-01-03T00:00:00.000Z'),
    ];
    expect(computeRiskAdjustedReturns(snapshots).insufficientData).toBe(true);
  });

  it('returns non-null insufficientData: false, but null ratios, when every period return is identical (zero variance)', () => {
    // Two consecutive +10% periods -- stdDev and downsideDev both 0.
    const snapshots = [
      snapshot(100, '2026-01-01T00:00:00.000Z'),
      snapshot(110, '2026-01-02T00:00:00.000Z'),
      snapshot(121, '2026-01-03T00:00:00.000Z'),
    ];
    const result = computeRiskAdjustedReturns(snapshots);
    expect(result.insufficientData).toBe(false);
    expect(result.sharpeRatio).toBeNull();
    expect(result.sortinoRatio).toBeNull();
  });

  it('computes both ratios from real period returns with a default 0 risk-free rate', () => {
    // Period returns: +10%, +20%, -10%, -20% (mean == 0 by construction) --
    // stdDev and downsideDev are both genuinely nonzero, so both ratios
    // collapse to ~0 only because the mean itself is 0, not because either
    // deviation is 0 (independently confirmed via the same mean/sample
    // stddev formula run outside the implementation).
    const snapshots = [
      snapshot(100, '2026-01-01T00:00:00.000Z'),
      snapshot(110, '2026-01-02T00:00:00.000Z'),
      snapshot(132, '2026-01-03T00:00:00.000Z'),
      snapshot(118.8, '2026-01-04T00:00:00.000Z'),
      snapshot(95.04, '2026-01-05T00:00:00.000Z'),
    ];
    const result = computeRiskAdjustedReturns(snapshots);
    expect(result.insufficientData).toBe(false);
    expect(result.sharpeRatio).not.toBeNull();
    expect(result.sortinoRatio).not.toBeNull();
    expect(result.sharpeRatio).toBeCloseTo(0, 9);
    expect(result.sortinoRatio).toBeCloseTo(0, 9);
  });

  it('applies a nonzero, explicitly-passed risk-free rate to both ratios', () => {
    const snapshots = [
      snapshot(100, '2026-01-01T00:00:00.000Z'),
      snapshot(110, '2026-01-02T00:00:00.000Z'),
      snapshot(132, '2026-01-03T00:00:00.000Z'),
      snapshot(118.8, '2026-01-04T00:00:00.000Z'),
      snapshot(95.04, '2026-01-05T00:00:00.000Z'),
    ];
    const result = computeRiskAdjustedReturns(snapshots, -0.01);
    // Independently derived (mean=0, stdDev=sqrt(1/30), downsideDev=sqrt(0.005)):
    // sharpe = 0.01 / 0.182574186 = 0.054772256
    // sortino = 0.01 / 0.070710678 = 0.141421356
    expect(result.sharpeRatio).toBeCloseTo(0.054772256, 8);
    expect(result.sortinoRatio).toBeCloseTo(0.141421356, 8);
  });

  it('computes downsideDev only from negative period returns, ignoring upside volatility', () => {
    // Only one negative return in the whole series -> fewer than 2 downside
    // returns -> downsideDev is forced to 0 -> sortinoRatio is null, while
    // sharpeRatio (driven by full-sample stdDev) is still a real number.
    const snapshots = [
      snapshot(100, '2026-01-01T00:00:00.000Z'),
      snapshot(120, '2026-01-02T00:00:00.000Z'), // +20%
      snapshot(90, '2026-01-03T00:00:00.000Z'), // -25%
      snapshot(135, '2026-01-04T00:00:00.000Z'), // +50%
    ];
    const result = computeRiskAdjustedReturns(snapshots);
    expect(result.insufficientData).toBe(false);
    expect(result.sortinoRatio).toBeNull();
    expect(result.sharpeRatio).not.toBeNull();
  });
});
