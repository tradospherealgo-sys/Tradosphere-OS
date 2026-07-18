import type { ExpertOpinion, ExpertName, Verdict } from '@tradosphere/shared-types';

// Task 5.1: the AI Council's shared contract. `ExpertOpinion`/`ExpertName`/
// `Verdict` already exist in packages/shared-types (from an earlier sprint) --
// this module is the *enforcement* layer: a runtime validator so that no
// agent (dummy or real) can ever emit a malformed opinion that silently
// drifts from the schema. Mirrors the "never fabricate, always validate"
// discipline established in Sprint 4's ResearchGap pattern, applied here to
// output-shape validation instead of missing-data handling.

export class InvalidOpinionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOpinionError';
  }
}

const VALID_EXPERT_NAMES: ExpertName[] = [
  'technical',
  'options',
  'sector',
  'quant',
  'strategy',
  'risk',
  'fundamental',
  'indices',
  'education',
];

const VALID_VERDICTS: Verdict[] = ['bullish', 'moderately_bullish', 'neutral', 'moderately_bearish', 'bearish'];

// Throws InvalidOpinionError on the first violation found; returns nothing on
// success. Callers that want a boolean check can wrap this in a try/catch --
// `runAgent()` in agent.ts is the primary caller and lets this throw.
export function assertValidOpinion(opinion: ExpertOpinion): void {
  if (!VALID_EXPERT_NAMES.includes(opinion.expert)) {
    throw new InvalidOpinionError(`unknown expert name: ${String(opinion.expert)}`);
  }

  if (!VALID_VERDICTS.includes(opinion.verdict)) {
    throw new InvalidOpinionError(`unknown verdict: ${String(opinion.verdict)}`);
  }

  if (typeof opinion.confidence !== 'number' || !Number.isFinite(opinion.confidence)) {
    throw new InvalidOpinionError('confidence must be a finite number');
  }
  if (opinion.confidence < 0 || opinion.confidence > 100) {
    throw new InvalidOpinionError(`confidence must be between 0 and 100, got ${opinion.confidence}`);
  }

  if (!Array.isArray(opinion.reasoning) || opinion.reasoning.length === 0) {
    throw new InvalidOpinionError('reasoning must be a non-empty array of strings');
  }
  for (const line of opinion.reasoning) {
    if (typeof line !== 'string' || line.trim().length === 0) {
      throw new InvalidOpinionError('reasoning must contain only non-empty strings');
    }
  }

  if (typeof opinion.generatedAtIso !== 'string' || Number.isNaN(Date.parse(opinion.generatedAtIso))) {
    throw new InvalidOpinionError('generatedAtIso must be a parseable ISO timestamp string');
  }
}
