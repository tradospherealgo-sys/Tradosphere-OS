import { describe, it, expect } from 'vitest';
import { computeMaxDrawdownPct } from '../src/drawdown';
import type { EquitySnapshotRecord } from '../src/equity-source';

function snapshot(totalEquity: number, asOfIso: string): EquitySnapshotRecord {
  return { totalEquity, asOfIso };
}

describe('computeMaxDrawdownPct', () => {
  it('returns null with zero snapshots', () => {
    expect(computeMaxDrawdownPct([])).toBeNull();
  });

  it('returns null with only one snapshot (no peak-to-trough move possible)', () => {
    expect(computeMaxDrawdownPct([snapshot(100_000, '2026-01-01T00:00:00.000Z')])).toBeNull();
  });

  it('returns 0 for a monotonically increasing equity curve', () => {
    const snapshots = [
      snapshot(100, '2026-01-01T00:00:00.000Z'),
      snapshot(110, '2026-01-02T00:00:00.000Z'),
      snapshot(120, '2026-01-03T00:00:00.000Z'),
    ];
    expect(computeMaxDrawdownPct(snapshots)).toBe(0);
  });

  it('takes the largest peak-to-trough decline across multiple peaks, not just the last one', () => {
    // peak 100 -> trough 80 (20% dd) -> new peak 120 -> trough 60 (50% dd off the new peak)
    const snapshots = [
      snapshot(100, '2026-01-01T00:00:00.000Z'),
      snapshot(80, '2026-01-02T00:00:00.000Z'),
      snapshot(120, '2026-01-03T00:00:00.000Z'),
      snapshot(60, '2026-01-04T00:00:00.000Z'),
    ];
    expect(computeMaxDrawdownPct(snapshots)).toBe(0.5);
  });

  it('expresses drawdown as a fraction of the running peak at the time of the trough', () => {
    const snapshots = [snapshot(200, '2026-01-01T00:00:00.000Z'), snapshot(150, '2026-01-02T00:00:00.000Z')];
    expect(computeMaxDrawdownPct(snapshots)).toBeCloseTo(0.25);
  });

  it('never divides by a non-positive peak, reporting 0 rather than crashing when equity never rises above 0', () => {
    const snapshots = [snapshot(0, '2026-01-01T00:00:00.000Z'), snapshot(-50, '2026-01-02T00:00:00.000Z')];
    expect(computeMaxDrawdownPct(snapshots)).toBe(0);
  });
});
