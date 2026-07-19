import type { ExpertName, ExpertOpinion, Verdict } from '@tradosphere/shared-types';
import { scoreToVerdict, verdictScore } from './scoring';

// Task 6.1: the CIO's consensus/weighting algorithm across all 9 services/ai
// agent opinions (Decision D8 -- domain-weighted).
//
// Only opinions whose expert carries a nonzero weight below move the
// blended verdict:
//   - the 6 domain agents (technical/options/sector/quant/fundamental/
//     indices) and strategy each carry weight 1.
//   - risk carries weight 0: RiskAgent's bullish/bearish scale means
//     favorable/unfavorable risk, not a price direction (see
//     services/ai/src/agents/risk-agent.ts's class-level comment) -- mixing
//     it into a directional score would be a category error. Risk's opinion
//     still drives task 6.2's veto gate, just not this score.
//   - education carries weight 0: EducationAgent explicitly mirrors the
//     group's existing consensus rather than forming a new verdict (see
//     services/ai/src/agents/education-agent.ts) -- including it here would
//     double-count the very thing it only explains.
//   - strategy is counted once, at the same weight as a single domain
//     agent -- it is already a confidence-weighted synthesis of the 6
//     domain opinions, so it acts as one cross-check on their own
//     synthesis, not a second independent read stacked on top of them.
//
// Any expert name not present in DOMAIN_WEIGHTS defaults to weight 0 --
// excluded from the score rather than fabricated a vote -- and is reported
// in ConsensusResult.excluded the same as risk/education.
const DOMAIN_WEIGHTS: Partial<Record<ExpertName, number>> = {
  technical: 1,
  options: 1,
  sector: 1,
  quant: 1,
  fundamental: 1,
  indices: 1,
  strategy: 1,
  risk: 0,
  education: 0,
};

function weightOf(expert: ExpertName): number {
  return DOMAIN_WEIGHTS[expert] ?? 0;
}

export interface ConsensusContribution {
  expert: ExpertName;
  verdict: Verdict;
  confidence: number;
  weight: number;
  // weight * confidence * verdictScore(verdict) -- the literal term this
  // opinion contributes to the weighted score's numerator. Task 6.3's
  // explainability trace reads this directly rather than recomputing it.
  contribution: number;
}

export interface ConsensusResult {
  verdict: Verdict;
  confidence: number;
  weightedScore: number;
  // Every opinion that carried nonzero weight, in input order.
  contributions: ConsensusContribution[];
  // Opinions received but not weighted into the score (weight 0 -- risk,
  // education, or an unrecognized expert name).
  excluded: ExpertName[];
}

export function computeConsensus(opinions: ExpertOpinion[]): ConsensusResult {
  const contributions: ConsensusContribution[] = [];
  const excluded: ExpertName[] = [];

  let totalWeight = 0; // sum(weight) over included opinions -- denominator for the confidence average
  let weightedConfidenceSum = 0; // sum(weight * confidence) -- numerator for the confidence average, denominator for the score
  let weightedScoreSum = 0; // sum(weight * confidence * verdictScore(verdict)) -- numerator for the blended score

  for (const opinion of opinions) {
    const weight = weightOf(opinion.expert);
    if (weight === 0) {
      excluded.push(opinion.expert);
      continue;
    }

    const contribution = weight * opinion.confidence * verdictScore(opinion.verdict);
    contributions.push({ expert: opinion.expert, verdict: opinion.verdict, confidence: opinion.confidence, weight, contribution });

    totalWeight += weight;
    weightedConfidenceSum += weight * opinion.confidence;
    weightedScoreSum += contribution;
  }

  // Nothing with nonzero weight and nonzero confidence to synthesize --
  // mirrors StrategyAgent/EducationAgent's own empty/zero-confidence guard
  // (services/ai/src/agents/strategy-agent.ts) rather than fabricating a
  // verdict from a divide-by-zero.
  if (weightedConfidenceSum === 0) {
    return { verdict: 'neutral', confidence: 0, weightedScore: 0, contributions, excluded };
  }

  const weightedScore = weightedScoreSum / weightedConfidenceSum;
  const verdict = scoreToVerdict(weightedScore);
  const confidence = Math.round(weightedConfidenceSum / totalWeight);

  return { verdict, confidence, weightedScore, contributions, excluded };
}
