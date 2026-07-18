import type { PriceBar, TechnicalAnalysisResult } from '@tradosphere/shared-types';
import { InsufficientDataError, rsi, ema, macd, analyzeVolume, detectBreakout } from './indicators';

// Task 4.1/4.6: composes the indicator library into one typed, schema-valid
// result. Any indicator's InsufficientDataError becomes an explicit
// ResearchGap -- never a fabricated or partially-filled technical read.
export function analyzeTechnical(symbol: string, bars: PriceBar[]): TechnicalAnalysisResult {
  try {
    return {
      status: 'ok',
      symbol,
      rsi14: rsi(bars, 14),
      ema20: ema(bars, 20),
      ema50: ema(bars, 50),
      macd: macd(bars, 12, 26, 9),
      volume: analyzeVolume(bars, 20),
      breakout: detectBreakout(bars, 20),
      generatedAtIso: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof InsufficientDataError) {
      return { status: 'gap', reason: 'insufficient_history', detail: err.message };
    }
    throw err;
  }
}
