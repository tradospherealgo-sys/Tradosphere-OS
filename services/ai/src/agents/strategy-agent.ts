import type { ExpertOpinion } from '@tradosphere/shared-types';
import type { ExpertAgent } from '../agent';
import { loadPrompt } from '../prompt-loader';
import { buildOpinion, scoreToVerdict, verdictScore } from './shared';

// Task 5.3: unlike the six domain agents (5.2), Strategy is a synthesis
// agent -- its TInput is the *other* agents' already-validated
// ExpertOpinion[] output, not a raw Research Engine result. This is a
// deliberate design choice (not literally specified in SPRINT_BOOK.md's
// 5.3 row) that anticipates Sprint 6's CIO engine: Strategy produces its
// own single schema-valid opinion by confidence-weighting the domain
// agents' verdicts, so the CIO engine's task 6.1 "consensus across all 9
// agent opinions" always has exactly one opinion per expert, including this
// one, to work with.
export interface StrategyAgentInput {
  opinions: ExpertOpinion[];
}

export class StrategyAgent implements ExpertAgent<StrategyAgentInput> {
  readonly name = 'strategy' as const;

  readonly systemPrompt: string = loadPrompt('strategy');

  analyze(input: StrategyAgentInput): ExpertOpinion {
    if (input.opinions.length === 0) {
      return buildOpinion(this.name, 'neutral', 0, ['no expert opinions available to synthesize a strategy']);
    }

    const totalConfidence = input.opinions.reduce((sum, o) => sum + o.confidence, 0);
    const weightedScore =
      totalConfidence === 0
        ? 0
        : input.opinions.reduce((sum, o) => sum + verdictScore(o.verdict) * o.confidence, 0) / totalConfidence;
    const verdict = scoreToVerdict(weightedScore);
    const avgConfidence = Math.round(totalConfidence / input.opinions.length);

    const leanSign = Math.sign(weightedScore);
    const agreeing = input.opinions.filter((o) => Math.sign(verdictScore(o.verdict)) === leanSign || verdictScore(o.verdict) === 0).length;

    const reasoning = [
      `synthesized ${input.opinions.length} expert opinions: ${input.opinions.map((o) => `${o.expert}=${o.verdict}`).join(', ')}`,
      `${agreeing}/${input.opinions.length} experts align with the overall ${verdict} lean (confidence-weighted score ${weightedScore.toFixed(2)})`,
    ];

    return buildOpinion(this.name, verdict, avgConfidence, reasoning);
  }
}
