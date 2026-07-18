import type { PriceBar } from '@tradosphere/shared-types';
import { InsufficientDataError } from './errors';
import { emaSeries } from './ema';

export interface MacdResult {
  macdLine: number;
  signalLine: number;
  histogram: number;
}

export function macd(bars: PriceBar[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  if (bars.length < slow + signalPeriod) {
    throw new InsufficientDataError(
      `MACD(${fast},${slow},${signalPeriod}) needs at least ${slow + signalPeriod} bars, got ${bars.length}`,
    );
  }

  const fastSeries = emaSeries(bars, fast);
  const slowSeries = emaSeries(bars, slow);
  // fastSeries starts earlier (shorter period) than slowSeries -- align both
  // series to the point where the slow EMA actually begins.
  const offset = fastSeries.length - slowSeries.length;
  const macdSeries = slowSeries.map((slowVal, i) => fastSeries[i + offset] - slowVal);

  // Signal line = EMA(signalPeriod) of the MACD series itself.
  const k = 2 / (signalPeriod + 1);
  const seed = macdSeries.slice(0, signalPeriod).reduce((sum, v) => sum + v, 0) / signalPeriod;
  let signal = seed;
  for (let i = signalPeriod; i < macdSeries.length; i += 1) {
    signal = macdSeries[i] * k + signal * (1 - k);
  }

  const macdLine = macdSeries[macdSeries.length - 1];
  return {
    macdLine: Number(macdLine.toFixed(4)),
    signalLine: Number(signal.toFixed(4)),
    histogram: Number((macdLine - signal).toFixed(4)),
  };
}
