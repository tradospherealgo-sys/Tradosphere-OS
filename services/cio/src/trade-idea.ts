import type { TradeIdea, Verdict } from '@tradosphere/shared-types';
import { verdictScore } from './scoring';

// Task 6.4: trade idea generator. SPRINT_BOOK.md lists this task's "Depends
// on" as 6.1 only, so this module reuses 6.1's verdictScore() (scoring.ts)
// to turn a verdict into a direction -- rather than re-deriving a second
// bullish/bearish mapping (Forge charter rule: reuse before rewrite) -- but
// deliberately does NOT take a RiskGateResult (6.2) or ExplainabilityTrace
// (6.3) as input. 6.2's Level 2 mitigation (positionSizeMultiplier /
// leverageMultiplier) adjusts position sizing and execution parameters, not
// the entry/stop-loss/target price levels TradeIdea itself models, so it's
// an orthogonal concern belonging to whatever assembles the final
// CioVerdict, not to idea generation itself.

export interface TradeIdeaInput {
  symbol: string;
  verdict: Verdict;
  referencePrice: number;
  // Distance from entry to stop-loss, as a percent of referencePrice.
  stopLossPct?: number;
  // Target distance is this multiple of the stop-loss distance -- i.e. the
  // risk:reward ratio the idea is generated to hit.
  targetRiskRewardRatio?: number;
  educationNote?: string;
}

export const DEFAULT_STOP_LOSS_PCT = 2;
export const DEFAULT_TARGET_RISK_REWARD_RATIO = 2;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// A neutral verdict carries no directional edge, so there is no
// entry/stop/target to report. Returning undefined here is the honest
// response -- fabricating a long-or-short guess for a neutral verdict would
// violate the no-placeholder-data discipline that governs every layer of
// this codebase (same principle as ResearchGap in packages/shared-types).
export function generateTradeIdea(input: TradeIdeaInput): TradeIdea | undefined {
  if (!input.symbol) {
    throw new Error('generateTradeIdea: symbol is required');
  }
  if (!Number.isFinite(input.referencePrice) || input.referencePrice <= 0) {
    throw new Error(
      `generateTradeIdea: referencePrice must be a positive finite number, got ${input.referencePrice}`,
    );
  }

  const stopLossPct = input.stopLossPct ?? DEFAULT_STOP_LOSS_PCT;
  const targetRiskRewardRatio = input.targetRiskRewardRatio ?? DEFAULT_TARGET_RISK_REWARD_RATIO;
  if (!Number.isFinite(stopLossPct) || stopLossPct <= 0 || stopLossPct >= 100) {
    throw new Error(
      `generateTradeIdea: stopLossPct must be a finite number between 0 and 100 (exclusive), got ${stopLossPct}`,
    );
  }
  if (!Number.isFinite(targetRiskRewardRatio) || targetRiskRewardRatio <= 0) {
    throw new Error(
      `generateTradeIdea: targetRiskRewardRatio must be a positive finite number, got ${targetRiskRewardRatio}`,
    );
  }

  const score = verdictScore(input.verdict);
  if (score === 0) {
    return undefined;
  }
  const direction: 'long' | 'short' = score > 0 ? 'long' : 'short';

  const riskDistance = input.referencePrice * (stopLossPct / 100);
  const rewardDistance = riskDistance * targetRiskRewardRatio;

  const rawStopLoss = direction === 'long' ? input.referencePrice - riskDistance : input.referencePrice + riskDistance;
  const rawTarget = direction === 'long' ? input.referencePrice + rewardDistance : input.referencePrice - rewardDistance;

  const entry = round2(input.referencePrice);
  const stopLoss = round2(rawStopLoss);
  const target = round2(rawTarget);

  if (entry === stopLoss) {
    throw new Error(
      'generateTradeIdea: computed stopLoss rounds to the same value as entry -- referencePrice/stopLossPct combination is too small to produce a valid stop-loss distance',
    );
  }

  // Computed from the final, rounded entry/stopLoss/target -- not restated
  // from targetRiskRewardRatio -- so riskRewardRatio is provably consistent
  // with the numbers actually returned, satisfying SPRINT_BOOK.md's "valid,
  // consistent numbers" verification target as a checkable invariant rather
  // than an assumption.
  const riskRewardRatio = round2(Math.abs(target - entry) / Math.abs(entry - stopLoss));

  return {
    symbol: input.symbol,
    direction,
    entry,
    stopLoss,
    target,
    riskRewardRatio,
    ...(input.educationNote !== undefined ? { educationNote: input.educationNote } : {}),
  };
}
