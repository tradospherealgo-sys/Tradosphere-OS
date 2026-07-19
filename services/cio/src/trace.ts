import type { ExpertName, ExpertOpinion, Verdict } from '@tradosphere/shared-types';
import type { ConsensusResult } from './consensus';
import type { RiskGateResult } from './risk-gate';
import { scoreToVerdict } from './scoring';

// Task 6.3: confidence scoring + full explainability trace -- "which agent
// said what, why", built directly from task 6.1's ConsensusResult and (when
// available) task 6.2's RiskGateResult, so nothing here is recomputed or
// re-derived differently than the actual verdict was.

export interface TraceEntry {
  expert: ExpertName;
  verdict: Verdict;
  confidence: number;
  weight: number;
  included: boolean; // true iff this opinion carried nonzero weight into the consensus score
  contribution: number; // 0 when excluded
  reasoning: string[];
}

export interface ExplainabilityTrace {
  // One entry per raw opinion, in input order -- every agent that spoke,
  // whether or not it was weighted into the directional score.
  entries: TraceEntry[];
  consensus: Pick<ConsensusResult, 'weightedScore' | 'verdict' | 'confidence'>;
  riskGate?: RiskGateResult;
  // Plain narrative lines, built purely from entries/consensus/riskGate
  // below -- nothing in here is a claim the rest of the trace can't back up.
  summary: string[];
}

export function buildExplainabilityTrace(
  opinions: ExpertOpinion[],
  consensus: ConsensusResult,
  riskGate?: RiskGateResult,
): ExplainabilityTrace {
  const contributionByExpert = new Map(consensus.contributions.map((c) => [c.expert, c]));

  const entries: TraceEntry[] = opinions.map((o) => {
    const contribution = contributionByExpert.get(o.expert);
    return {
      expert: o.expert,
      verdict: o.verdict,
      confidence: o.confidence,
      weight: contribution?.weight ?? 0,
      included: contribution !== undefined,
      contribution: contribution?.contribution ?? 0,
      reasoning: o.reasoning,
    };
  });

  const summary: string[] = [
    `${entries.length} expert opinion${entries.length === 1 ? '' : 's'} reviewed; ${consensus.contributions.length} carried directional weight, ${consensus.excluded.length} did not (${consensus.excluded.length > 0 ? consensus.excluded.join(', ') : 'none'}).`,
    `Weighted score ${consensus.weightedScore.toFixed(2)} maps to a ${consensus.verdict} verdict at ${consensus.confidence}% confidence.`,
    ...entries.map((e) =>
      e.included
        ? `${e.expert}: ${e.verdict} at ${e.confidence}% confidence, weight ${e.weight} -> contributed ${e.contribution.toFixed(1)} to the score. ${e.reasoning[0] ?? ''}`.trim()
        : `${e.expert}: ${e.verdict} at ${e.confidence}% confidence -- not weighted into the directional score (Decision D8). ${e.reasoning[0] ?? ''}`.trim(),
    ),
  ];

  if (riskGate) {
    summary.push(
      `Risk gate: Level ${riskGate.level} (${riskGate.approved ? 'approved' : 'vetoed'}). ${riskGate.reasons.join('; ')}${
        riskGate.mitigation ? ` Mitigation applied: ${riskGate.mitigation.note}.` : ''
      }`,
    );
  }

  return {
    entries,
    consensus: { weightedScore: consensus.weightedScore, verdict: consensus.verdict, confidence: consensus.confidence },
    riskGate,
    summary,
  };
}

// The property SPRINT_BOOK.md task 6.3 asks for: the trace's recorded
// per-expert entries alone must be enough to *independently* recompute the
// same verdict computeConsensus() produced from the raw opinions -- without
// calling computeConsensus() again and without looking at the original
// opinions array. This is what makes the trace a real, sufficient audit
// record rather than just a log dump sitting next to the answer.
export function reproduceVerdictFromTrace(trace: ExplainabilityTrace): Verdict {
  const included = trace.entries.filter((e) => e.included);
  const totalWeight = included.reduce((sum, e) => sum + e.weight, 0);
  const weightedConfidenceSum = included.reduce((sum, e) => sum + e.weight * e.confidence, 0);
  const weightedScoreSum = included.reduce((sum, e) => sum + e.contribution, 0);

  if (totalWeight === 0 || weightedConfidenceSum === 0) {
    return 'neutral';
  }
  return scoreToVerdict(weightedScoreSum / weightedConfidenceSum);
}
