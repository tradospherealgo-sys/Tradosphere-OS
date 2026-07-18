import { describe, it, expect } from 'vitest';
import type { ExpertOpinion } from '@tradosphere/shared-types';
import { RiskAgent } from '../src/agents/risk-agent';
import { assertValidOpinion } from '../src/opinion-schema';

function opinion(overrides: Partial<ExpertOpinion>): ExpertOpinion {
  return {
    expert: 'technical',
    verdict: 'neutral',
    confidence: 60,
    reasoning: ['fixture opinion'],
    generatedAtIso: new Date().toISOString(),
    ...overrides,
  };
}

describe('RiskAgent (Sprint 5 task 5.3)', () => {
  const agent = new RiskAgent();

  it('reads low volatility + aligned experts as favorable (bullish) risk', () => {
    const opinions = [opinion({ verdict: 'bullish' }), opinion({ verdict: 'moderately_bullish' })];
    const result = agent.analyze({ opinions, volatilityAnnualizedPct: 10 });
    assertValidOpinion(result);
    expect(result.expert).toBe('risk');
    expect(result.verdict).toBe('bullish');
  });

  it('reads high volatility + strongly disagreeing experts as unfavorable (bearish) risk', () => {
    const opinions = [
      opinion({ verdict: 'bullish' }),
      opinion({ verdict: 'bearish' }),
      opinion({ verdict: 'moderately_bearish' }),
    ];
    const result = agent.analyze({ opinions, volatilityAnnualizedPct: 45 });
    assertValidOpinion(result);
    expect(result.verdict).toBe('bearish');
  });

  it('returns a neutral, zero-confidence opinion when there is no data at all', () => {
    const result = agent.analyze({ opinions: [] });
    assertValidOpinion(result);
    expect(result.verdict).toBe('neutral');
    expect(result.confidence).toBe(0);
  });
});
