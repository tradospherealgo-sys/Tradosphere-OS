import { describe, it, expect } from 'vitest';
import { computeAllocation } from '../src/allocation';
import type { PricedPosition } from '../src/positions';

describe('computeAllocation', () => {
  it('returns nothing for no priced positions', () => {
    expect(computeAllocation([])).toEqual([]);
  });

  it('allocates 100% to a single position', () => {
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 }, currentPrice: 120 },
    ];
    const [entry] = computeAllocation(priced);
    expect(entry).toEqual({ symbol: 'AAPL', direction: 'long', marketValue: 1200, allocationPct: 1 });
  });

  it('avoids dividing by zero when total exposure is zero -- allocationPct is 0, not NaN', () => {
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'long', quantity: 0, averageEntryPrice: 100 }, currentPrice: 120 },
    ];
    const [entry] = computeAllocation(priced);
    expect(entry.allocationPct).toBe(0);
  });

  it('sums allocationPct to 100% for a fully-hedged book (equal long and short exposure), not 0%', () => {
    // The denominator is total *absolute* exposure, so a long and a short of
    // equal size don't cancel each other out to a meaningless 0% total --
    // exactly what allocation.ts's own doc comment calls out.
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 }, currentPrice: 100 },
      { position: { symbol: 'TSLA', direction: 'short', quantity: 10, averageEntryPrice: 100 }, currentPrice: 100 },
    ];
    const entries = computeAllocation(priced);
    const total = entries.reduce((sum, e) => sum + e.allocationPct, 0);
    expect(total).toBeCloseTo(1);
    expect(entries.map((e) => e.allocationPct)).toEqual([0.5, 0.5]);
  });

  it('sorts entries by allocationPct descending', () => {
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 }, currentPrice: 120 },
      { position: { symbol: 'TSLA', direction: 'short', quantity: 5, averageEntryPrice: 300 }, currentPrice: 250 },
      { position: { symbol: 'MSFT', direction: 'long', quantity: 2, averageEntryPrice: 50 }, currentPrice: 60 },
    ];
    // marketValue: AAPL 1200, TSLA -1250, MSFT 120 -> abs exposure 1200/1250/120
    const entries = computeAllocation(priced);
    expect(entries.map((e) => e.symbol)).toEqual(['TSLA', 'AAPL', 'MSFT']);
    expect(entries[0].allocationPct).toBeGreaterThan(entries[1].allocationPct);
    expect(entries[1].allocationPct).toBeGreaterThan(entries[2].allocationPct);
  });
});
