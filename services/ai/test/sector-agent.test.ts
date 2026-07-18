import { describe, it, expect } from 'vitest';
import { SectorAgent } from '../src/agents/sector-agent';
import { assertValidOpinion } from '../src/opinion-schema';
import { makeGap, makeSector } from './fixtures';

describe('SectorAgent (Sprint 5 task 5.2)', () => {
  const agent = new SectorAgent();

  it('reads inflow rotation as moderately bullish', () => {
    const opinion = agent.analyze(makeSector({ rotation: 'inflow' }));
    assertValidOpinion(opinion);
    expect(opinion.expert).toBe('sector');
    expect(opinion.verdict).toBe('moderately_bullish');
  });

  it('reads outflow rotation as moderately bearish', () => {
    const opinion = agent.analyze(makeSector({ rotation: 'outflow' }));
    assertValidOpinion(opinion);
    expect(opinion.verdict).toBe('moderately_bearish');
  });

  it('reads neutral rotation as a neutral opinion', () => {
    const opinion = agent.analyze(makeSector({ rotation: 'neutral' }));
    assertValidOpinion(opinion);
    expect(opinion.verdict).toBe('neutral');
  });

  it('returns a neutral, zero-confidence opinion on a research gap', () => {
    const opinion = agent.analyze(makeGap('missing_sector_data', 'no sector price history'));
    assertValidOpinion(opinion);
    expect(opinion.confidence).toBe(0);
  });
});
