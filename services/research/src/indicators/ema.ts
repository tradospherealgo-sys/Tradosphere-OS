import type { PriceBar } from '@tradosphere/shared-types';
import { InsufficientDataError } from './errors';

// Returns the full EMA series (not just the latest value) -- MACD needs the
// whole series to compute its own signal-line EMA on top.
export function emaSeries(bars: PriceBar[], period: number): number[] {
  if (bars.length < period) {
    throw new InsufficientDataError(`EMA(${period}) needs at least ${period} bars, got ${bars.length}`);
  }
  const k = 2 / (period + 1);
  const seed = bars.slice(0, period).reduce((sum, b) => sum + b.close, 0) / period;
  const series: number[] = [seed];
  for (let i = period; i < bars.length; i += 1) {
    const prev = series[series.length - 1];
    series.push(bars[i].close * k + prev * (1 - k));
  }
  return series;
}

export function ema(bars: PriceBar[], period: number): number {
  const series = emaSeries(bars, period);
  return Number(series[series.length - 1].toFixed(2));
}
