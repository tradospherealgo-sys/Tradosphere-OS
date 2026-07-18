import { describe, it, expect } from 'vitest';
import { IndicesAgent } from '../src/agents/indices-agent';
import { TechnicalAgent } from '../src/agents/technical-agent';
import { assertValidOpinion } from '../src/opinion-schema';
import { makeGap, makeTechnical } from './fixtures';

describe('IndicesAgent (Sprint 5 task 5.2, Decision D7)', () => {
  const agent = new IndicesAgent();

  it('stamps expert as "indices" while reusing TechnicalAgent interpretation', () => {
    const input = makeTechnical({ symbol: 'NIFTY50' });
    const opinion = agent.analyze(input);
    const delegateOpinion = new TechnicalAgent().analyze(input);

    assertValidOpinion(opinion);
    expect(opinion.expert).toBe('indices');
    expect(opinion.verdict).toBe(delegateOpinion.verdict);
    expect(opinion.confidence).toBe(delegateOpinion.confidence);
    expect(opinion.reasoning).toEqual(delegateOpinion.reasoning);
  });

  it('returns a neutral, zero-confidence opinion on a research gap', () => {
    const opinion = agent.analyze(makeGap('insufficient_history', 'no index-level price history'));
    assertValidOpinion(opinion);
    expect(opinion.expert).toBe('indices');
    expect(opinion.confidence).toBe(0);
  });
});
