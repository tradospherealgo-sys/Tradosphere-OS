import { describe, it, expect } from 'vitest';
import type { ExpertOpinion } from '@tradosphere/shared-types';
import { StrategyAgent } from '../src/agents/strategy-agent';
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

describe('StrategyAgent (Sprint 5 task 5.3)', () => {
  const agent = new StrategyAgent();

  it('synthesizes a bullish lean when most high-confidence opinions are bullish', () => {
    const opinions = [
      opinion({ expert: 'technical', verdict: 'bullish', confidence: 90 }),
      opinion({ expert: 'quant', verdict: 'bullish', confidence: 90 }),
      opinion({ expert: 'fundamental', verdict: 'bullish', confidence: 80 }),
      opinion({ expert: 'options', verdict: 'moderately_bearish', confidence: 10 }),
    ];
    const result = agent.analyze({ opinions });
    assertValidOpinion(result);
    expect(result.expert).toBe('strategy');
    expect(result.verdict).toBe('bullish');
  });

  it('synthesizes a bearish lean when most high-confidence opinions are bearish', () => {
    const opinions = [
      opinion({ expert: 'technical', verdict: 'bearish', confidence: 90 }),
      opinion({ expert: 'quant', verdict: 'bearish', confidence: 85 }),
      opinion({ expert: 'fundamental', verdict: 'moderately_bearish', confidence: 70 }),
      opinion({ expert: 'options', verdict: 'moderately_bullish', confidence: 10 }),
    ];
    const result = agent.analyze({ opinions });
    assertValidOpinion(result);
    expect(result.verdict).toBe('bearish');
  });

  it('returns a neutral, zero-confidence opinion when there is nothing to synthesize', () => {
    const result = agent.analyze({ opinions: [] });
    assertValidOpinion(result);
    expect(result.verdict).toBe('neutral');
    expect(result.confidence).toBe(0);
  });
});
