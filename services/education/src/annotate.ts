import type { ExpertOpinion, TradeIdea } from '@tradosphere/shared-types';
import { EducationAgent, runAgent } from '@tradosphere/service-ai';

// Task 7.4: standalone trade-idea annotation -- attaches a one-line,
// plain-language education note to a TradeIdea using the same
// EducationAgent as the tutor endpoint in tutor.ts. Deliberately NOT wired
// into services/cio (D12): deciding *when* a TradeIdea gets annotated
// during the CIO pipeline is an orchestration concern out of scope for
// Sprint 7 and deferred to Sprint 9. This module only proves the
// capability exists and is callable over HTTP today; the caller (a future
// orchestration layer, or a manual caller) owns the decision of when to
// invoke it. services/education and services/cio stay fully isolated this
// sprint -- this file has no import of, or from, services/cio.
//
// reasoning[0] is always defined: EducationAgent.analyze() guarantees a
// non-empty reasoning array on every path (see education-agent.ts), so this
// never assigns an undefined educationNote.

export interface AnnotateTradeIdeaInput {
  tradeIdea: TradeIdea;
  opinions: ExpertOpinion[];
}

export function annotateTradeIdea(input: AnnotateTradeIdeaInput): TradeIdea {
  const opinion = runAgent(new EducationAgent(), { opinions: input.opinions });
  return {
    ...input.tradeIdea,
    educationNote: opinion.reasoning[0],
  };
}
