import { describe, it, expect } from 'vitest';
import { computeConsensus } from '../src/consensus';
import { makeNineOpinions, makeOpinion } from './fixtures';

describe('computeConsensus (Sprint 6 task 6.1)', () => {
  it('produces deterministic, hand-verifiable output on a fixed fixture set', () => {
    // Hand-computed against makeNineOpinions(): only the 7 weight-1 experts
    // (6 domain + strategy) contribute; risk and education (weight 0) do
    // not. totalWeight=7, weightedConfidenceSum=515, weightedScoreSum=840.
    const result = computeConsensus(makeNineOpinions());

    expect(result.contributions).toHaveLength(7);
    expect(result.excluded).toEqual(['risk', 'education']);
    expect(result.weightedScore).toBeCloseTo(840 / 515, 10);
    expect(result.confidence).toBe(74); // round(515 / 7)
    expect(result.verdict).toBe('bullish');
  });

  it('is deterministic: identical input produces identical output on repeat calls', () => {
    const opinions = makeNineOpinions();
    const first = computeConsensus(opinions);
    const second = computeConsensus(opinions);
    expect(second).toEqual(first);
  });

  it("excludes risk's opinion from the directional score regardless of how bearish or confident it is", () => {
    const withoutRisk = computeConsensus(makeNineOpinions().filter((o) => o.expert !== 'risk'));
    const withExtremeRisk = computeConsensus([
      ...makeNineOpinions().filter((o) => o.expert !== 'risk'),
      makeOpinion({ expert: 'risk', verdict: 'bearish', confidence: 100, reasoning: ['maximum bearish risk read'] }),
    ]);

    expect(withExtremeRisk.verdict).toBe(withoutRisk.verdict);
    expect(withExtremeRisk.confidence).toBe(withoutRisk.confidence);
    expect(withExtremeRisk.weightedScore).toBe(withoutRisk.weightedScore);
    expect(withExtremeRisk.contributions).toEqual(withoutRisk.contributions);
    // Risk's opinion is still ingested and reported, just not weighted --
    // task 6.2's veto gate is what actually acts on it.
    expect(withExtremeRisk.excluded).toContain('risk');
  });

  it("excludes education's opinion from the directional score regardless of its verdict", () => {
    const withoutEducation = computeConsensus(makeNineOpinions().filter((o) => o.expert !== 'education'));
    const withBearishEducation = computeConsensus([
      ...makeNineOpinions().filter((o) => o.expert !== 'education'),
      makeOpinion({ expert: 'education', verdict: 'bearish', confidence: 100 }),
    ]);

    expect(withBearishEducation.verdict).toBe(withoutEducation.verdict);
    expect(withBearishEducation.weightedScore).toBe(withoutEducation.weightedScore);
  });

  it('synthesizes a bearish lean when the weighted (non-excluded) opinions are predominantly bearish', () => {
    const opinions = [
      makeOpinion({ expert: 'technical', verdict: 'bearish', confidence: 90 }),
      makeOpinion({ expert: 'quant', verdict: 'bearish', confidence: 85 }),
      makeOpinion({ expert: 'fundamental', verdict: 'moderately_bearish', confidence: 70 }),
      makeOpinion({ expert: 'strategy', verdict: 'bearish', confidence: 80 }),
      makeOpinion({ expert: 'options', verdict: 'moderately_bullish', confidence: 10 }),
    ];
    const result = computeConsensus(opinions);
    expect(result.verdict).toBe('bearish');
  });

  it('returns a neutral, zero-confidence result with empty contributions on no input', () => {
    const result = computeConsensus([]);
    expect(result.verdict).toBe('neutral');
    expect(result.confidence).toBe(0);
    expect(result.weightedScore).toBe(0);
    expect(result.contributions).toEqual([]);
    expect(result.excluded).toEqual([]);
  });

  it('returns a neutral, zero-confidence result (not NaN) when every weighted opinion has zero confidence', () => {
    const opinions = [
      makeOpinion({ expert: 'technical', verdict: 'bullish', confidence: 0 }),
      makeOpinion({ expert: 'quant', verdict: 'bearish', confidence: 0 }),
    ];
    const result = computeConsensus(opinions);
    expect(result.verdict).toBe('neutral');
    expect(result.confidence).toBe(0);
    expect(result.weightedScore).toBe(0);
    expect(Number.isNaN(result.weightedScore)).toBe(false);
  });

  it('returns a neutral, zero-confidence result when only weight-0 experts (risk, education) are present', () => {
    const result = computeConsensus([
      makeOpinion({ expert: 'risk', verdict: 'bearish', confidence: 90 }),
      makeOpinion({ expert: 'education', verdict: 'bullish', confidence: 90 }),
    ]);
    expect(result.verdict).toBe('neutral');
    expect(result.confidence).toBe(0);
    expect(result.excluded).toEqual(['risk', 'education']);
  });

  it('counts strategy once, at the same weight as a single domain agent', () => {
    const withStrategy = computeConsensus([
      makeOpinion({ expert: 'technical', verdict: 'bullish', confidence: 80 }),
      makeOpinion({ expert: 'strategy', verdict: 'bullish', confidence: 80 }),
    ]);
    const twoDomainAgents = computeConsensus([
      makeOpinion({ expert: 'technical', verdict: 'bullish', confidence: 80 }),
      makeOpinion({ expert: 'quant', verdict: 'bullish', confidence: 80 }),
    ]);
    // Same weight (1 + 1) and same confidence/verdict shape -> same blended result.
    expect(withStrategy.weightedScore).toBe(twoDomainAgents.weightedScore);
    expect(withStrategy.confidence).toBe(twoDomainAgents.confidence);
  });
});
