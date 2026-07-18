import type { ExpertOpinion } from '@tradosphere/shared-types';
import type { ExpertAgent } from '../agent';
import { loadPrompt } from '../prompt-loader';
import { buildOpinion, stdDevOf, verdictScore } from './shared';

// Task 5.3: Risk is the other synthesis agent. It takes the same domain
// opinions Strategy consumes, plus the quant module's own annualized
// volatility figure, and expresses "risk" on the same five-point Verdict
// scale every other agent uses -- since ExpertOpinion.verdict is not
// parameterized per expert (packages/shared-types), Risk reuses bullish/
// bearish to mean "favorable/low risk" vs "unfavorable/high risk" rather
// than a literal market direction. This mapping is documented here rather
// than adding a Risk-specific verdict type, keeping every agent's output on
// one shared schema (this sprint's whole point).
export interface RiskAgentInput {
  opinions: ExpertOpinion[];
  volatilityAnnualizedPct?: number;
}

export class RiskAgent implements ExpertAgent<RiskAgentInput> {
  readonly name = 'risk' as const;

  readonly systemPrompt: string = loadPrompt('risk');

  analyze(input: RiskAgentInput): ExpertOpinion {
    if (input.opinions.length === 0 && input.volatilityAnnualizedPct === undefined) {
      return buildOpinion(this.name, 'neutral', 0, ['no opinions or volatility data available to assess risk']);
    }

    const reasoning: string[] = [];
    let riskPoints = 0; // higher = riskier

    const volatility = input.volatilityAnnualizedPct ?? 0;
    if (volatility >= 30) {
      riskPoints += 2;
      reasoning.push(`annualized volatility ${volatility}% is high`);
    } else if (volatility >= 15) {
      riskPoints += 1;
      reasoning.push(`annualized volatility ${volatility}% is moderate`);
    } else {
      reasoning.push(`annualized volatility ${volatility}% is low`);
    }

    const scores = input.opinions.map((o) => verdictScore(o.verdict));
    const disagreement = scores.length > 1 ? stdDevOf(scores) : 0;
    if (disagreement >= 1.5) {
      riskPoints += 2;
      reasoning.push(`experts strongly disagree (verdict spread ${disagreement.toFixed(2)})`);
    } else if (disagreement >= 0.75) {
      riskPoints += 1;
      reasoning.push(`experts moderately disagree (verdict spread ${disagreement.toFixed(2)})`);
    } else {
      reasoning.push('experts are broadly aligned');
    }

    // Fewer risk points -> favorable/low risk (bullish); more risk points ->
    // unfavorable/high risk (bearish). See class-level comment for the
    // bullish/bearish-as-risk-favorability mapping.
    const verdict =
      riskPoints <= 0
        ? 'bullish'
        : riskPoints === 1
          ? 'moderately_bullish'
          : riskPoints === 2
            ? 'neutral'
            : riskPoints === 3
              ? 'moderately_bearish'
              : 'bearish';
    const confidence = Math.max(30, 90 - riskPoints * 12);

    return buildOpinion(this.name, verdict, confidence, reasoning);
  }
}
