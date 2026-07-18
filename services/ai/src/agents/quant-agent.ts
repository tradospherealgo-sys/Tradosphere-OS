import type { ExpertOpinion, QuantAnalysisResult } from '@tradosphere/shared-types';
import type { ExpertAgent } from '../agent';
import { loadPrompt } from '../prompt-loader';
import { buildOpinion, gapOpinion } from './shared';

// Task 5.2: consumes services/research's analyzeQuant() output type
// (QuantAnalysisResult). The module's own buy/sell/hold mean-reversion
// signal maps directly to a moderate directional verdict.
export class QuantAgent implements ExpertAgent<QuantAnalysisResult> {
  readonly name = 'quant' as const;

  readonly systemPrompt: string = loadPrompt('quant');

  analyze(input: QuantAnalysisResult): ExpertOpinion {
    if (input.status === 'gap') return gapOpinion(this.name, input);

    const reasoning = [`z-score ${input.zScore}, annualized volatility ${input.volatilityAnnualizedPct}%`];

    if (input.meanReversionSignal === 'buy') return buildOpinion(this.name, 'moderately_bullish', 60, reasoning);
    if (input.meanReversionSignal === 'sell') return buildOpinion(this.name, 'moderately_bearish', 60, reasoning);
    return buildOpinion(this.name, 'neutral', 50, reasoning);
  }
}
