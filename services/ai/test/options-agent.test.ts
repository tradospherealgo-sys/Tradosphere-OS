import { describe, it, expect } from 'vitest';
import { OptionsAgent } from '../src/agents/options-agent';
import { assertValidOpinion } from '../src/opinion-schema';
import { makeGap, makeOptionChain } from './fixtures';

describe('OptionsAgent (Sprint 5 task 5.2)', () => {
  const agent = new OptionsAgent();

  it('reads call_writing as moderately bearish', () => {
    const opinion = agent.analyze(makeOptionChain({ interpretation: 'call_writing' }));
    assertValidOpinion(opinion);
    expect(opinion.expert).toBe('options');
    expect(opinion.verdict).toBe('moderately_bearish');
  });

  it('reads put_writing as moderately bullish', () => {
    const opinion = agent.analyze(makeOptionChain({ interpretation: 'put_writing' }));
    assertValidOpinion(opinion);
    expect(opinion.verdict).toBe('moderately_bullish');
  });

  it('reads neutral interpretation as a neutral opinion', () => {
    const opinion = agent.analyze(makeOptionChain({ interpretation: 'neutral' }));
    assertValidOpinion(opinion);
    expect(opinion.verdict).toBe('neutral');
  });

  it('returns a neutral, zero-confidence opinion on a research gap', () => {
    const opinion = agent.analyze(makeGap('missing_option_chain', 'no option chain data'));
    assertValidOpinion(opinion);
    expect(opinion.confidence).toBe(0);
  });
});
