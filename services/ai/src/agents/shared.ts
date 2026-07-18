import type { ExpertName, ExpertOpinion, ResearchGap, Verdict } from '@tradosphere/shared-types';

// Shared by every Sprint 5.2/5.3 agent. Two responsibilities:
//   1. gapOpinion() -- when the Research Engine reports a ResearchGap
//      (missing/insufficient data) instead of a real result, every agent
//      must surface that same honesty up through the opinion layer rather
//      than fabricating a verdict. Same "never fabricate" discipline as
//      Sprint 4, now applied one layer up.
//   2. buildOpinion() -- a small constructor so every agent stamps
//      `generatedAtIso` the same way instead of repeating `new Date().toISOString()`
//      in each agent file.

export function gapOpinion(expert: ExpertName, gap: ResearchGap): ExpertOpinion {
  return {
    expert,
    verdict: 'neutral',
    confidence: 0,
    reasoning: [`no verdict: ${gap.detail}`],
    generatedAtIso: new Date().toISOString(),
  };
}

export function buildOpinion(expert: ExpertName, verdict: Verdict, confidence: number, reasoning: string[]): ExpertOpinion {
  return { expert, verdict, confidence, reasoning, generatedAtIso: new Date().toISOString() };
}

// Task 5.3: Strategy and Risk are synthesis agents -- they consume the other
// domain agents' ExpertOpinion[] output rather than raw Research Engine
// results, so they need a way to move between the five-point Verdict scale
// and a numeric score. Kept here so both agents share one mapping instead of
// each defining their own.
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

export function stdDevOf(values: number[]): number {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
