import { describe, it, expect } from 'vitest';
import { QuantAgent } from '../src/agents/quant-agent';
import { assertValidOpinion } from '../src/opinion-schema';
import { makeGap, makeQuant } from './fixtures';

describe('QuantAgent (Sprint 5 task 5.2)', () => {
  const agent = new QuantAgent();

  it('reads a buy mean-reversion signal as moderately bullish', () => {
    const opinion = agent.analyze(makeQuant({ meanReversionSignal: 'buy' }));
    assertValidOpinion(opinion);
    expect(opinion.expert).toBe('quant');
    expect(opinion.verdict).toBe('moderately_bullish');
  });

  it('reads a sell mean-reversion signal as moderately bearish', () => {
    const opinion = agent.analyze(makeQuant({ meanReversionSignal: 'sell' }));
    assertValidOpinion(opinion);
    expect(opinion.verdict).toBe('moderately_bearish');
  });

  it('reads a hold signal as a neutral opinion', () => {
    const opinion = agent.analyze(makeQuant({ meanReversionSignal: 'hold' }));
    assertValidOpinion(opinion);
    expect(opinion.verdict).toBe('neutral');
  });

  it('returns a neutral, zero-confidence opinion on a research gap', () => {
    const opinion = agent.analyze(makeGap('insufficient_history', 'not enough bars for z-score'));
    assertValidOpinion(opinion);
    expect(opinion.confidence).toBe(0);
  });
});
