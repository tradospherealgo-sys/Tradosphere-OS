import type { ExpertOpinion, TechnicalAnalysisResult } from '@tradosphere/shared-types';
import type { ExpertAgent } from '../agent';
import { loadPrompt } from '../prompt-loader';
import { buildOpinion, gapOpinion } from './shared';

// Task 5.2: consumes services/research's analyzeTechnical() output type
// directly (TechnicalAnalysisResult, from packages/shared-types) -- this
// agent only interprets already-computed indicators into a verdict +
// confidence + reasoning trace, it does not recompute anything.
export class TechnicalAgent implements ExpertAgent<TechnicalAnalysisResult> {
  readonly name = 'technical' as const;

  // Task 5.5: this expert's persona/methodology lives in
  // knowledge/prompts/technical.md, not as an inline string here.
  readonly systemPrompt: string = loadPrompt('technical');

  analyze(input: TechnicalAnalysisResult): ExpertOpinion {
    if (input.status === 'gap') return gapOpinion(this.name, input);

    const reasoning: string[] = [];
    let bullishPoints = 0;
    let bearishPoints = 0;

    if (input.rsi14 >= 60) {
      bullishPoints += 1;
      reasoning.push(`RSI(14) at ${input.rsi14} indicates bullish momentum`);
    } else if (input.rsi14 <= 40) {
      bearishPoints += 1;
      reasoning.push(`RSI(14) at ${input.rsi14} indicates bearish momentum`);
    } else {
      reasoning.push(`RSI(14) at ${input.rsi14} is neutral`);
    }

    if (input.ema20 > input.ema50) {
      bullishPoints += 1;
      reasoning.push('EMA20 above EMA50 (short-term uptrend)');
    } else if (input.ema20 < input.ema50) {
      bearishPoints += 1;
      reasoning.push('EMA20 below EMA50 (short-term downtrend)');
    }

    if (input.macd.histogram > 0) {
      bullishPoints += 1;
      reasoning.push('MACD histogram positive');
    } else if (input.macd.histogram < 0) {
      bearishPoints += 1;
      reasoning.push('MACD histogram negative');
    }

    if (input.breakout.direction === 'up') {
      bullishPoints += 1;
      reasoning.push(`breakout above level ${input.breakout.level}`);
    } else if (input.breakout.direction === 'down') {
      bearishPoints += 1;
      reasoning.push(`breakdown below level ${input.breakout.level}`);
    }

    if (input.volume.volumeSpike) {
      reasoning.push('volume spike confirms conviction behind the move');
    }

    const net = bullishPoints - bearishPoints;
    const verdict =
      net >= 2 ? 'bullish' : net === 1 ? 'moderately_bullish' : net === 0 ? 'neutral' : net === -1 ? 'moderately_bearish' : 'bearish';
    const confidence = Math.min(95, 50 + Math.abs(net) * 12);

    return buildOpinion(this.name, verdict, confidence, reasoning);
  }
}
