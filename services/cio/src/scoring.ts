import type { Verdict } from '@tradosphere/shared-types';

// Decision D9: services/cio depends only on @tradosphere/shared-types, not on
// @tradosphere/service-ai as a workspace package -- mirroring the deliberate
// service-isolation pattern services/ai already established relative to
// services/research (see services/ai/test/fixtures.ts). These two functions
// are therefore a deliberate, small duplication of
// services/ai/src/agents/shared.ts's verdictScore()/scoreToVerdict(), not a
// divergence: the five-point Verdict scale and its numeric mapping are part
// of the shared contract (packages/shared-types), so both copies must stay
// numerically identical. If this mapping ever needs to change, it must
// change in both places.

const VERDICT_SCORES: Record<Verdict, number> = {
  bearish: -2,
  moderately_bearish: -1,
  neutral: 0,
  moderately_bullish: 1,
  bullish: 2,
};

export function verdictScore(verdict: Verdict): number {
  return VERDICT_SCORES[verdict];
}

export function scoreToVerdict(score: number): Verdict {
  if (score >= 1.5) return 'bullish';
  if (score >= 0.5) return 'moderately_bullish';
  if (score > -0.5) return 'neutral';
  if (score > -1.5) return 'moderately_bearish';
  return 'bearish';
}
