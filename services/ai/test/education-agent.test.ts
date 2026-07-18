import { describe, it, expect } from 'vitest';
import type { ExpertOpinion } from '@tradosphere/shared-types';
import { EducationAgent } from '../src/agents/education-agent';
import { assertValidOpinion } from '../src/opinion-schema';

function opinion(overrides: Partial<ExpertOpinion>): ExpertOpinion {
  return {
    expert: 'technical',
    verdict: 'bullish',
    confidence: 80,
    reasoning: ['RSI(14) at 68 indicates bullish momentum'],
    generatedAtIso: new Date().toISOString(),
    ...overrides,
  };
}

describe('EducationAgent (Sprint 5 task 5.4)', () => {
  const agent = new EducationAgent();

  it('returns a schema-valid, plain-language explanation mirroring the confidence-weighted consensus', () => {
    const opinions = [
      opinion({ expert: 'technical', verdict: 'bullish', confidence: 80 }),
      opinion({ expert: 'quant', verdict: 'moderately_bearish', confidence: 20, reasoning: ['z-score -1.8, annualized volatility 22.5%'] }),
    ];
    const result = agent.analyze({ opinions });
    assertValidOpinion(result);

    expect(result.expert).toBe('education');
    expect(result.verdict).toBe('moderately_bullish');
    expect(result.reasoning[0]).toContain('AI Council');
    expect(result.reasoning.some((line) => line.includes('Technical expert'))).toBe(true);
    expect(result.reasoning.some((line) => line.includes('Quant expert'))).toBe(true);
    // plain-language, not raw jargon acronyms
    expect(result.reasoning[0]).not.toMatch(/RSI|z-score/);
  });

  it('avoids jargon in the summary line even when source reasoning is technical', () => {
    const result = agent.analyze({ opinions: [opinion({ verdict: 'bearish', confidence: 90 })] });
    assertValidOpinion(result);
    expect(result.verdict).toBe('bearish');
    expect(result.reasoning[0]).toMatch(/expects the price to fall/);
  });

  it('returns a neutral, zero-confidence explanation when there is nothing to explain', () => {
    const result = agent.analyze({ opinions: [] });
    assertValidOpinion(result);
    expect(result.verdict).toBe('neutral');
    expect(result.confidence).toBe(0);
  });
});
