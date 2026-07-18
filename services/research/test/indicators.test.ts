import { describe, it, expect } from 'vitest';
import { rsi, ema, emaSeries, macd, analyzeVolume, detectBreakout, InsufficientDataError } from '../src/indicators';
import { makeBars } from './fixtures';

// Sprint 4 task 4.1 exit criterion: "unit tests against fixture price
// series." Each indicator is tested for its core behavior and for throwing
// InsufficientDataError rather than silently returning a partial/fabricated
// value on too little data.
describe('rsi', () => {
  it('returns 100 for a strictly increasing series (no losses at all)', () => {
    const bars = makeBars(20, { stepPerBar: 1 });
    expect(rsi(bars, 14)).toBe(100);
  });

  it('returns 0 for a strictly decreasing series (no gains at all)', () => {
    const bars = makeBars(20, { stepPerBar: -1 });
    expect(rsi(bars, 14)).toBe(0);
  });

  it('throws InsufficientDataError with too few bars', () => {
    const bars = makeBars(10, { stepPerBar: 1 });
    expect(() => rsi(bars, 14)).toThrow(InsufficientDataError);
  });
});

describe('ema / emaSeries', () => {
  it('equals the flat price for a constant series', () => {
    const bars = makeBars(30, { startPrice: 50, stepPerBar: 0 });
    expect(ema(bars, 20)).toBe(50);
  });

  it('throws InsufficientDataError with too few bars', () => {
    const bars = makeBars(5, { stepPerBar: 1 });
    expect(() => emaSeries(bars, 20)).toThrow(InsufficientDataError);
  });
});

describe('macd', () => {
  it('is all zeros for a perfectly flat series', () => {
    const bars = makeBars(40, { startPrice: 75, stepPerBar: 0 });
    const result = macd(bars, 12, 26, 9);
    expect(result).toEqual({ macdLine: 0, signalLine: 0, histogram: 0 });
  });

  it('produces a positive macd line for a sustained uptrend', () => {
    const bars = makeBars(40, { startPrice: 100, stepPerBar: 1 });
    const result = macd(bars, 12, 26, 9);
    expect(result.macdLine).toBeGreaterThan(0);
  });

  it('throws InsufficientDataError with too few bars', () => {
    const bars = makeBars(20, { stepPerBar: 1 });
    expect(() => macd(bars, 12, 26, 9)).toThrow(InsufficientDataError);
  });
});

describe('analyzeVolume', () => {
  it('flags a volume spike on the latest bar', () => {
    const bars = makeBars(21, { volume: 1000, volumeOverride: { 20: 3000 } });
    const result = analyzeVolume(bars, 20);
    expect(result.averageVolume).toBe(1000);
    expect(result.latestVolume).toBe(3000);
    expect(result.volumeSpike).toBe(true);
  });

  it('does not flag ordinary volume as a spike', () => {
    const bars = makeBars(21, { volume: 1000, volumeOverride: { 20: 1100 } });
    const result = analyzeVolume(bars, 20);
    expect(result.volumeSpike).toBe(false);
  });

  it('throws InsufficientDataError with too few bars', () => {
    const bars = makeBars(10, { volume: 1000 });
    expect(() => analyzeVolume(bars, 20)).toThrow(InsufficientDataError);
  });
});

describe('detectBreakout', () => {
  it('detects an upward breakout above the prior range', () => {
    const bars = makeBars(20, { startPrice: 100, stepPerBar: 0 });
    bars.push({ timestampIso: new Date(2026, 1, 1).toISOString(), open: 100, high: 120, low: 99, close: 115 });
    const result = detectBreakout(bars, 20);
    expect(result.direction).toBe('up');
  });

  it('detects a downward breakout below the prior range', () => {
    const bars = makeBars(20, { startPrice: 100, stepPerBar: 0 });
    bars.push({ timestampIso: new Date(2026, 1, 1).toISOString(), open: 100, high: 101, low: 80, close: 85 });
    const result = detectBreakout(bars, 20);
    expect(result.direction).toBe('down');
  });

  it('reports no breakout when the close stays within the prior range', () => {
    const bars = makeBars(21, { startPrice: 100, stepPerBar: 0 });
    const result = detectBreakout(bars, 20);
    expect(result.direction).toBe('none');
  });

  it('throws InsufficientDataError with too few bars', () => {
    const bars = makeBars(10, { stepPerBar: 0 });
    expect(() => detectBreakout(bars, 20)).toThrow(InsufficientDataError);
  });
});
