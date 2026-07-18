import type { ExpertOpinion, Verdict } from '@tradosphere/shared-types';
import type { ExpertAgent } from '../agent';
import { loadPrompt } from '../prompt-loader';
import { buildOpinion, scoreToVerdict, verdictScore } from './shared';

// Task 5.4: the explanatory layer -- reused again in Sprint 7's Education
// module to turn the AI Council's jargon-heavy opinions into a
// plain-language narrative a beginner can follow. Like Strategy/Risk (5.3),
// its TInput is the other agents' already-validated ExpertOpinion[] output
// rather than a raw Research Engine result; unlike them, its job isn't to
// add a new verdict on top of the data -- it mirrors the group's existing
// confidence-weighted consensus and explains it in plain words.
export interface EducationAgentInput {
  opinions: ExpertOpinion[];
}

const PLAIN_VERDICT: Record<Verdict, string> = {
  bullish: 'expects the price to rise',
  moderately_bullish: 'leans toward the price rising',
  neutral: 'sees no clear direction',
  moderately_bearish: 'leans toward the price falling',
  bearish: 'expects the price to fall',
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export class EducationAgent implements ExpertAgent<EducationAgentInput> {
  readonly name = 'education' as const;

  readonly systemPrompt: string = loadPrompt('education');

  analyze(input: EducationAgentInput): ExpertOpinion {
    if (input.opinions.length === 0) {
      return buildOpinion(this.name, 'neutral', 0, ['nothing to explain yet -- no expert opinions are available']);
    }

    const totalConfidence = input.opinions.reduce((sum, o) => sum + o.confidence, 0);
    const weightedScore =
      totalConfidence === 0
        ? 0
        : input.opinions.reduce((sum, o) => sum + verdictScore(o.verdict) * o.confidence, 0) / totalConfidence;
    const verdict = scoreToVerdict(weightedScore);
    const avgConfidence = Math.round(totalConfidence / input.opinions.length);

    const reasoning = [
      `Overall, the AI Council ${PLAIN_VERDICT[verdict]}, based on ${input.opinions.length} expert ${
        input.opinions.length === 1 ? 'opinion' : 'opinions'
      }.`,
      ...input.opinions.map(
        (o) => `${capitalize(o.expert)} expert: ${PLAIN_VERDICT[o.verdict]} (${o.confidence}% confident). ${o.reasoning[0]}`,
      ),
    ];

    return buildOpinion(this.name, verdict, avgConfidence, reasoning);
  }
}
