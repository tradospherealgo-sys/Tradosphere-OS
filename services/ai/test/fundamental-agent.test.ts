import { describe, it, expect } from 'vitest';
import { FundamentalAgent } from '../src/agents/fundamental-agent';
import { assertValidOpinion } from '../src/opinion-schema';
import { makeFundamental, makeGap } from './fixtures';

describe('FundamentalAgent (Sprint 5 task 5.2)', () => {
  const agent = new FundamentalAgent();

  it('reads a strong verdict as bullish', () => {
    const opinion = agent.analyze(makeFundamental({ verdict: 'strong' }));
    assertValidOpinion(opinion);
    expect(opinion.expert).toBe('fundamental');
    expect(opinion.verdict).toBe('bullish');
  });

  it('reads a weak verdict as moderately bearish', () => {
    const opinion = agent.analyze(makeFundamental({ verdict: 'weak' }));
    assertValidOpinion(opinion);
    expect(opinion.verdict).toBe('moderately_bearish');
  });

  it('reads a stable verdict as a neutral opinion', () => {
    const opinion = agent.analyze(makeFundamental({ verdict: 'stable' }));
    assertValidOpinion(opinion);
    expect(opinion.verdict).toBe('neutral');
  });

  it('returns a neutral, zero-confidence opinion on a research gap', () => {
    const opinion = agent.analyze(makeGap('missing_fundamentals', 'no ingested financials'));
    assertValidOpinion(opinion);
    expect(opinion.confidence).toBe(0);
  });
});
