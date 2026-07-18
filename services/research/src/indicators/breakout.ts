import type { PriceBar } from '@tradosphere/shared-types';
import { InsufficientDataError } from './errors';

export interface BreakoutResult {
  direction: 'up' | 'down' | 'none';
  level: number;
}

// Detects the latest close breaking above the highest high, or below the
// lowest low, of the preceding `period` bars (the latest bar itself is
// excluded from that range so it can't "break out" of a range it's part of).
export function detectBreakout(bars: PriceBar[], period = 20): BreakoutResult {
  if (bars.length < period + 1) {
    throw new InsufficientDataError(`breakout detection needs at least ${period + 1} bars, got ${bars.length}`);
  }
  const window = bars.slice(-period - 1, -1);
  const latest = bars[bars.length - 1];
  const highestHigh = Math.max(...window.map((b) => b.high));
  const lowestLow = Math.min(...window.map((b) => b.low));

  if (latest.close > highestHigh) return { direction: 'up', level: Number(highestHigh.toFixed(2)) };
  if (latest.close < lowestLow) return { direction: 'down', level: Number(lowestLow.toFixed(2)) };
  return { direction: 'none', level: Number(latest.close.toFixed(2)) };
}
