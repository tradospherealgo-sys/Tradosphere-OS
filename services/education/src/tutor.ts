import type { ExpertOpinion } from '@tradosphere/shared-types';
import { EducationAgent, runAgent } from '@tradosphere/service-ai';

// Task 7.3: the AI tutor -- turns an already-computed AI Council verdict
// (the same ExpertOpinion[] shape produced by Sprint 5's nine expert agents)
// into a plain-language explanation a learner can read. This is a thin
// adapter around EducationAgent/runAgent rather than a new agent: the
// "explain the Council's reasoning in plain words" logic already lives in
// services/ai (Sprint 5 Task 5.4), and Forge's charter rule 5 (reuse before
// rewrite) means this module's only job is to expose that existing agent
// over services/education's own HTTP surface.
//
// The opinions array is validated at the HTTP boundary by
// validation.ts's tutorExplainSchema before this function ever runs (see
// the comment on tutorExplainSchema for why assertValidOpinion() alone
// isn't enough there). An empty array is a valid input -- EducationAgent
// already returns an explicit neutral/0-confidence opinion for that case
// rather than throwing, so this function does not special-case it either.

export interface TutorExplainInput {
  opinions: ExpertOpinion[];
}

// The result IS an ExpertOpinion (expert: 'education') -- returned as-is
// rather than remapped into a bespoke response shape, so the API response
// can never drift from what EducationAgent/runAgent actually produced.
export function explainOpinions(input: TutorExplainInput): ExpertOpinion {
  return runAgent(new EducationAgent(), { opinions: input.opinions });
}
