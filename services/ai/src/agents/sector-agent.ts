import type { ExpertOpinion, SectorAnalysisResult } from '@tradosphere/shared-types';
import type { ExpertAgent } from '../agent';
import { loadPrompt } from '../prompt-loader';
import { buildOpinion, gapOpinion } from './shared';

// Task 5.2: consumes services/research's analyzeSector() output type
// (SectorAnalysisResult). Rotation inflow/outflow maps directly to a
// moderate directional verdict; neutral rotation stays neutral.
export class SectorAgent implements ExpertAgent<SectorAnalysisResult> {
  readonly name = 'sector' as const;

  readonly systemPrompt: string = loadPrompt('sector');

  analyze(input: SectorAnalysisResult): ExpertOpinion {
    if (input.status === 'gap') return gapOpinion(this.name, input);

    const reasoning = [`${input.sector} relative strength vs benchmark: ${input.relativeStrengthPct}% (${input.rotation})`];

    if (input.rotation === 'inflow') return buildOpinion(this.name, 'moderately_bullish', 60, reasoning);
    if (input.rotation === 'outflow') return buildOpinion(this.name, 'moderately_bearish', 60, reasoning);
    return buildOpinion(this.name, 'neutral', 50, reasoning);
  }
}
