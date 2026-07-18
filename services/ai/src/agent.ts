import type { ExpertName, ExpertOpinion } from '@tradosphere/shared-types';
import { assertValidOpinion } from './opinion-schema';

// Task 5.1: the agent framework every one of Sprint 5's nine expert agents
// (technical/options/sector/quant/strategy/risk/fundamental/indices/education)
// will implement. `TInput` is generic because each agent consumes a different
// slice of the Research Engine's output (e.g. TechnicalAnalysisResult for the
// technical agent, OptionAnalysisResult for the options agent) -- the
// framework itself doesn't need to know which.
export interface ExpertAgent<TInput> {
  readonly name: ExpertName;
  analyze(input: TInput): ExpertOpinion;
}

// The exit criterion for this task is "no agent output bypasses the shared
// opinion schema" -- `runAgent` is what makes that structural rather than a
// matter of every agent remembering to validate itself. Every call site in
// later tasks (5.2-5.4) should call agents through this wrapper, not by
// calling `agent.analyze()` directly.
export function runAgent<TInput>(agent: ExpertAgent<TInput>, input: TInput): ExpertOpinion {
  const opinion = agent.analyze(input);
  assertValidOpinion(opinion);
  return opinion;
}
