import { describe, it, expect } from 'vitest';
import { TechnicalAgent } from '../src/agents/technical-agent';
import { assertValidOpinion } from '../src/opinion-schema';
import { makeGap, makeTechnical } from './fixtures';

describe('TechnicalAgent (Sprint 5 task 5.2)', () => {
  const agent = new TechnicalAgent();

  it('returns a bullish, schema-valid opinion for strongly bullish indicators', () => {
    const opinion = agent.analyze(makeTechnical());
    expect(() => assertValidOpinion(opinion)).not.toThrow();
    expect(opinion.expert).toBe('technical');
    expect(opinion.verdict).toBe('bullish');
    expect(opinion.reasoning.length).toBeGreaterThan(0);
  });

  it('returns a bearish opinion for strongly bearish indicators', () => {
    const input = makeTechnical({
      rsi14: 25,
      ema20: 95,
      ema50: 100,
      macd: { macdLine: -1, signalLine: -0.5, histogram: -0.5 },
      breakout: { direction: 'down', level: 98 },
    });
    const opinion = agent.analyze(input);
    assertValidOpinion(opinion);
    expect(opinion.verdict).toBe('bearish');
  });

  it('returns a neutral, zero-confidence opinion (never fabricated) on a research gap', () => {
    const opinion = agent.analyze(makeGap('insufficient_history', 'not enough bars'));
    assertValidOpinion(opinion);
    expect(opinion.verdict).toBe('neutral');
    expect(opinion.confidence).toBe(0);
    expect(opinion.reasoning[0]).toContain('not enough bars');
  });
});
