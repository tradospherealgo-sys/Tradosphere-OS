import type { ExpertOpinion } from '@tradosphere/shared-types';
import type { PortfolioRiskContext } from '../src/risk-gate';

// Task 6.1+ fixtures: hand-built ExpertOpinion fixtures, not generated via
// services/ai's real agents -- services/cio deliberately depends only on
// packages/shared-types, not on services/ai (Decision D9), so its tests are
// built purely against the shared ExpertOpinion contract, the same pattern
// services/ai/test/fixtures.ts already uses one layer down against
// services/research.

export function makeOpinion(overrides: Partial<ExpertOpinion> = {}): ExpertOpinion {
  return {
    expert: 'technical',
    verdict: 'neutral',
    confidence: 60,
    reasoning: ['fixture opinion'],
    generatedAtIso: new Date().toISOString(),
    ...overrides,
  };
}

// A full, all-9-experts opinion set with deliberately distinct per-expert
// values (never the same confidence/verdict twice) so a test can catch a
// mixed-up expert/field bug that identical fixture values would hide.
export function makeNineOpinions(): ExpertOpinion[] {
  return [
    makeOpinion({ expert: 'technical', verdict: 'bullish', confidence: 80, reasoning: ['strong uptrend'] }),
    makeOpinion({ expert: 'options', verdict: 'bullish', confidence: 60, reasoning: ['call writing'] }),
    makeOpinion({ expert: 'sector', verdict: 'neutral', confidence: 50, reasoning: ['no rotation'] }),
    makeOpinion({ expert: 'quant', verdict: 'moderately_bullish', confidence: 90, reasoning: ['buy signal'] }),
    makeOpinion({ expert: 'fundamental', verdict: 'bullish', confidence: 70, reasoning: ['strong fundamentals'] }),
    makeOpinion({ expert: 'indices', verdict: 'bullish', confidence: 80, reasoning: ['index uptrend'] }),
    makeOpinion({ expert: 'strategy', verdict: 'bullish', confidence: 85, reasoning: ['synthesized bullish lean'] }),
    makeOpinion({ expert: 'risk', verdict: 'bearish', confidence: 95, reasoning: ['high volatility, experts disagree'] }),
    makeOpinion({ expert: 'education', verdict: 'neutral', confidence: 40, reasoning: ['explains the group consensus'] }),
  ];
}

// A portfolio comfortably inside every Level 1/Level 2 threshold -- the
// baseline for task 6.2's risk-gate tests to override from.
export function makeHealthyPortfolio(overrides: Partial<PortfolioRiskContext> = {}): PortfolioRiskContext {
  return {
    currentDrawdownPct: 2,
    maxDrawdownPct: 10,
    currentExposurePct: 30,
    maxExposurePct: 80,
    ...overrides,
  };
}
