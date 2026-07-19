import { describe, it, expect } from 'vitest';
import { calculateRealizedPnl, validateOutcome } from '../src/pnl';
import { InvalidOutcomeError } from '../src/errors';

// Task 8.2's own repository sits on top of these two pure functions --
// exercising them directly here means the money math is proven once,
// independent of whichever storage adapter (Drizzle or the in-memory fake)
// ends up calling it. Mirrors services/cio/test's direct coverage of
// scoring.ts ahead of cio.ts's own orchestration tests.

describe('calculateRealizedPnl', () => {
  it('a buy (long) entry profits when the exit price is higher than the fill price', () => {
    expect(calculateRealizedPnl('buy', 10, 100, 110)).toBe(100); // (110-100)*10
  });

  it('a buy (long) entry loses when the exit price is lower than the fill price', () => {
    expect(calculateRealizedPnl('buy', 10, 100, 90)).toBe(-100);
  });

  it('a sell (short) entry profits when the exit price is lower than the fill price', () => {
    expect(calculateRealizedPnl('sell', 10, 100, 90)).toBe(100); // (100-90)*10
  });

  it('a sell (short) entry loses when the exit price is higher than the fill price', () => {
    expect(calculateRealizedPnl('sell', 10, 100, 110)).toBe(-100);
  });

  it('is exactly zero when the exit price equals the fill price, buy or sell', () => {
    expect(calculateRealizedPnl('buy', 25, 2500, 2500)).toBe(0);
    expect(calculateRealizedPnl('sell', 25, 2500, 2500)).toBe(0);
  });

  it('scales linearly with quantity', () => {
    expect(calculateRealizedPnl('buy', 1, 100, 110)).toBe(10);
    expect(calculateRealizedPnl('buy', 50, 100, 110)).toBe(500);
  });

  it('handles fractional prices without rounding', () => {
    expect(calculateRealizedPnl('buy', 10, 2512.5, 2530.75)).toBeCloseTo(182.5, 10);
  });

  it('never reads recommendedDirection -- only the entry\'s own fill side determines long/short', () => {
    // No recommendedDirection parameter exists on this function at all; a
    // 'sell' fill is always priced as a short regardless of what any CIO
    // recommendation might have said, per Decision D16.
    expect(calculateRealizedPnl('sell', 5, 50, 40)).toBe(50);
  });
});

describe('validateOutcome', () => {
  it('accepts a valid outcome without throwing', () => {
    expect(() => validateOutcome({ exitPrice: 110, exitAtIso: '2026-07-18T10:00:00.000Z' })).not.toThrow();
  });

  it('rejects a zero exitPrice', () => {
    expect(() => validateOutcome({ exitPrice: 0, exitAtIso: '2026-07-18T10:00:00.000Z' })).toThrow(
      InvalidOutcomeError,
    );
  });

  it('rejects a negative exitPrice', () => {
    expect(() => validateOutcome({ exitPrice: -5, exitAtIso: '2026-07-18T10:00:00.000Z' })).toThrow(
      InvalidOutcomeError,
    );
  });

  it('rejects a non-finite exitPrice (NaN/Infinity)', () => {
    expect(() => validateOutcome({ exitPrice: NaN, exitAtIso: '2026-07-18T10:00:00.000Z' })).toThrow(
      InvalidOutcomeError,
    );
    expect(() => validateOutcome({ exitPrice: Infinity, exitAtIso: '2026-07-18T10:00:00.000Z' })).toThrow(
      InvalidOutcomeError,
    );
  });

  it('rejects an empty exitAtIso', () => {
    expect(() => validateOutcome({ exitPrice: 100, exitAtIso: '' })).toThrow(InvalidOutcomeError);
  });

  it('rejects an unparseable exitAtIso', () => {
    expect(() => validateOutcome({ exitPrice: 100, exitAtIso: 'not-a-date' })).toThrow(InvalidOutcomeError);
  });
});
