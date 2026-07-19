import type { ExpertOpinion, TradeIdea } from '@tradosphere/shared-types';

// Task 6.2: the CIO's conflict-resolution / veto layer (Decision D8 --
// three-level tiered veto, per Anshh's exact Session 7 spec).
//
//   Level 1 (hard veto)  -- any of: drawdown at/over the portfolio limit,
//     exposure at/over the portfolio limit, invalid/missing upstream data,
//     consensus confidence below the minimum, or a candidate trade idea's
//     risk:reward below the minimum. Absolute: `approved` is false, and the
//     CIO orchestration layer must never construct a path that proceeds
//     past it ("the CIO must never override a Level 1 veto" -- Anshh,
//     Session 7).
//   Level 2 (mitigate)  -- no Level 1 violation, but RiskAgent's own
//     opinion reads unfavorable risk, or drawdown/exposure is within 80% of
//     its hard limit. `approved` is true, but only alongside the returned
//     `mitigation` (reduced position size/leverage) -- the CIO "may proceed
//     with Level 2 recommendations after applying the prescribed
//     adjustments", not proceed unmodified.
//   Level 3 (full approval) -- neither of the above triggered.
//
// This module intentionally does not depend on task 6.1's ConsensusResult
// or task 6.4's trade idea generator types directly -- it takes the handful
// of plain values it actually evaluates (consensusConfidence, a candidate
// idea's riskRewardRatio) so it is independently testable against fixture
// values before 6.4 exists, per Decision D8's task ordering.

export interface PortfolioRiskContext {
  currentDrawdownPct: number;
  maxDrawdownPct: number;
  currentExposurePct: number;
  maxExposurePct: number;
}

// Suggested policy defaults for real orchestration wiring (6.4/6.5). Not
// baked into evaluateRiskGate() itself -- every threshold is an explicit
// input so the gate stays a pure, fully parameterized function with no
// hidden policy assumptions, consistent with RiskAgent (5.3) taking its
// volatility figure as an explicit input rather than computing it itself.
export const DEFAULT_MIN_CONFIDENCE = 40;
export const DEFAULT_MIN_RISK_REWARD_RATIO = 1.5;
export const DEFAULT_MAX_DRAWDOWN_PCT = 10;
export const DEFAULT_MAX_EXPOSURE_PCT = 80;

export interface RiskGateInput {
  // The CIO's own directional read (task 6.1's ConsensusResult.confidence).
  consensusConfidence: number;
  minConfidence: number;

  portfolio: PortfolioRiskContext;

  // False whenever any upstream research/agent input was a ResearchGap or
  // otherwise failed validation -- the repo-wide "never fabricate on bad
  // data" rule (Sprint 4's ResearchGap discipline, Sprint 5's opinion
  // schema) extended to the CIO's own gate. Callers must derive this from
  // real upstream state, never hardcode it true.
  dataValid: boolean;

  // RiskAgent's own opinion (Sprint 5, task 5.3). Its bullish/bearish scale
  // means favorable/unfavorable risk, not a price direction (see
  // services/ai/src/agents/risk-agent.ts's class-level comment) -- that is
  // exactly why task 6.1 excludes it from the directional consensus score
  // (Decision D8) and it is evaluated here instead. Optional: a gate call
  // with no Risk opinion available simply cannot evaluate the Level 2
  // risk-read trigger below (never fabricated).
  riskOpinion?: ExpertOpinion;

  // The candidate trade idea this verdict would produce, if one exists yet.
  // Optional because 6.2 must be independently testable before 6.4 (trade
  // idea generation) is built -- the minRiskRewardRatio check below only
  // runs when a candidate is supplied.
  candidateTradeIdea?: Pick<TradeIdea, 'riskRewardRatio'>;
  minRiskRewardRatio: number;
}

export type RiskGateLevel = 1 | 2 | 3;

export interface RiskGateMitigation {
  positionSizeMultiplier: number; // e.g. 0.5 = half the normal position size
  leverageMultiplier: number; // e.g. 0.5 = half the normal leverage
  note: string;
}

export interface RiskGateResult {
  level: RiskGateLevel;
  // false only at Level 1. Level 2 is also "approved" in the sense that the
  // CIO may proceed -- conditionally, only alongside `mitigation` -- per
  // Anshh's exact wording above; only Level 1 is an absolute block.
  approved: boolean;
  reasons: string[];
  mitigation?: RiskGateMitigation; // present only at Level 2
}

export function evaluateRiskGate(input: RiskGateInput): RiskGateResult {
  const level1Reasons: string[] = [];

  if (!input.dataValid) {
    level1Reasons.push('underlying data failed validation (invalid or missing data)');
  }
  if (input.portfolio.currentDrawdownPct >= input.portfolio.maxDrawdownPct) {
    level1Reasons.push(
      `current drawdown ${input.portfolio.currentDrawdownPct}% is at or over the portfolio limit of ${input.portfolio.maxDrawdownPct}%`,
    );
  }
  if (input.portfolio.currentExposurePct >= input.portfolio.maxExposurePct) {
    level1Reasons.push(
      `current exposure ${input.portfolio.currentExposurePct}% is at or over the portfolio limit of ${input.portfolio.maxExposurePct}%`,
    );
  }
  if (input.consensusConfidence < input.minConfidence) {
    level1Reasons.push(`consensus confidence ${input.consensusConfidence}% is below the minimum of ${input.minConfidence}%`);
  }
  if (input.candidateTradeIdea && input.candidateTradeIdea.riskRewardRatio < input.minRiskRewardRatio) {
    level1Reasons.push(
      `candidate risk:reward ${input.candidateTradeIdea.riskRewardRatio} is below the minimum of ${input.minRiskRewardRatio}`,
    );
  }

  if (level1Reasons.length > 0) {
    return { level: 1, approved: false, reasons: level1Reasons };
  }

  const level2Reasons: string[] = [];
  if (input.riskOpinion && (input.riskOpinion.verdict === 'bearish' || input.riskOpinion.verdict === 'moderately_bearish')) {
    level2Reasons.push(`Risk agent reads unfavorable risk (${input.riskOpinion.verdict}, ${input.riskOpinion.confidence}% confident)`);
  }
  if (input.portfolio.currentDrawdownPct >= 0.8 * input.portfolio.maxDrawdownPct) {
    level2Reasons.push(
      `current drawdown ${input.portfolio.currentDrawdownPct}% is within 80% of the portfolio limit of ${input.portfolio.maxDrawdownPct}%`,
    );
  }
  if (input.portfolio.currentExposurePct >= 0.8 * input.portfolio.maxExposurePct) {
    level2Reasons.push(
      `current exposure ${input.portfolio.currentExposurePct}% is within 80% of the portfolio limit of ${input.portfolio.maxExposurePct}%`,
    );
  }

  if (level2Reasons.length > 0) {
    return {
      level: 2,
      approved: true,
      reasons: level2Reasons,
      mitigation: {
        positionSizeMultiplier: 0.5,
        leverageMultiplier: 0.5,
        note: 'position size and leverage halved, execution parameters tightened, per Level 2 risk mitigation',
      },
    };
  }

  return { level: 3, approved: true, reasons: ['no Level 1 or Level 2 risk conditions triggered'] };
}
