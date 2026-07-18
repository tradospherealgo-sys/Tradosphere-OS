import type { ExpertOpinion, FundamentalAnalysisResult } from '@tradosphere/shared-types';
import type { ExpertAgent } from '../agent';
import { loadPrompt } from '../prompt-loader';
import { buildOpinion, gapOpinion } from './shared';

// Task 5.2: consumes services/research's analyzeFundamentals() output type
// (FundamentalAnalysisResult). The module's own strong/stable/weak verdict
// maps directly to a directional opinion.
export class FundamentalAgent implements ExpertAgent<FundamentalAnalysisResult> {
  readonly name = 'fundamental' as const;

  readonly systemPrompt: string = loadPrompt('fundamental');

  analyze(input: FundamentalAnalysisResult): ExpertOpinion {
    if (input.status === 'gap') return gapOpinion(this.name, input);

    const reasoning = [
      `PE ${input.peRatio}, D/E ${input.debtToEquity}, revenue growth ${input.revenueGrowthYoyPct}% YoY, net margin ${input.netProfitMarginPct}%`,
    ];

    if (input.verdict === 'strong') return buildOpinion(this.name, 'bullish', 70, reasoning);
    if (input.verdict === 'weak') return buildOpinion(this.name, 'moderately_bearish', 65, reasoning);
    return buildOpinion(this.name, 'neutral', 50, reasoning);
  }
}
