import type { PriceBar, QuantAnalysisResult } from '@tradosphere/shared-types';

// Task 4.5: a small statistical signal set -- a mean-reversion z-score on
// price against its own rolling window, plus annualized realized
// volatility from daily returns. Reuses the same `PriceBar` input contract
// as analyzeTechnical (4.1). Returns an explicit gap (reason:
// 'insufficient_history') instead of a fabricated z-score/volatility when
// there isn't a full window of history -- same discipline as 4.1-4.4.
function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function dailyReturns(bars: PriceBar[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    returns.push((bars[i].close - bars[i - 1].close) / bars[i - 1].close);
  }
  return returns;
}

export function analyzeQuant(symbol: string, bars: PriceBar[], period = 20): QuantAnalysisResult {
  if (bars.length < period + 1) {
    return {
      status: 'gap',
      reason: 'insufficient_history',
      detail: `need at least ${period + 1} bars to compute quant signals, got ${bars.length}`,
    };
  }

  const window = bars.slice(-period);
  const closes = window.map((b) => b.close);
  const meanClose = mean(closes);
  const stdDevClose = stdDev(closes);
  const latestClose = closes[closes.length - 1];
  const zScore = stdDevClose === 0 ? 0 : Math.round(((latestClose - meanClose) / stdDevClose) * 100) / 100;

  const returns = dailyReturns(bars.slice(-(period + 1)));
  const dailyVol = stdDev(returns);
  const volatilityAnnualizedPct = Math.round(dailyVol * Math.sqrt(252) * 100 * 100) / 100;

  let meanReversionSignal: 'buy' | 'sell' | 'hold' = 'hold';
  if (zScore <= -1.5) {
    meanReversionSignal = 'buy';
  } else if (zScore >= 1.5) {
    meanReversionSignal = 'sell';
  }

  return {
    status: 'ok',
    symbol,
    zScore,
    volatilityAnnualizedPct,
    meanReversionSignal,
    generatedAtIso: new Date().toISOString(),
  };
}
