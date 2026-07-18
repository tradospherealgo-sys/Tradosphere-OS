import type { PriceBar } from '@tradosphere/shared-types';
import { InsufficientDataError } from './errors';

// Wilder's RSI -- the original/standard formulation (smoothed average
// gain/loss, not a simple moving average of gains/losses).
export function rsi(bars: PriceBar[], period = 14): number {
  if (bars.length < period + 1) {
    throw new InsufficientDataError(`RSI(${period}) needs at least ${period + 1} bars, got ${bars.length}`);
  }

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = bars[i].close - bars[i - 1].close;
    if (change >= 0) gainSum += change;
    else lossSum += -change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  for (let i = period + 1; i < bars.length; i += 1) {
    const change = bars[i].close - bars[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}
