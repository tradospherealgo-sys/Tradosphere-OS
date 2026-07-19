import { describe, it, expect } from 'vitest';
import { buildExplainabilityTrace, reproduceVerdictFromTrace } from '../src/trace';
import { computeConsensus } from '../src/consensus';
import { evaluateRiskGate, DEFAULT_MIN_CONFIDENCE, DEFAULT_MIN_RISK_REWARD_RATIO } from '../src/risk-gate';
import { makeOpinion, makeNineOpinions, makeHealthyPortfolio } from './fixtures';
import type { ExpertOpinion } from '@tradosphere/shared-types';

// Task 6.3's verification target (SPRINT_BOOK.md): the trace must reproduce
// the verdict from raw opinions -- i.e. reproduceVerdictFromTrace(trace) must
// equal computeConsensus(opinions).verdict, computed purely from the trace's
// own recorded entries, never by re-calling computeConsensus() or re-reading
// the opinions array.
function assertTraceReproducesVerdict(opinions: ExpertOpinion[]): void {
  const consensus = computeConsensus(opinions);
  const trace = buildExplainabilityTrace(opinions, consensus);
  expect(reproduceVerdictFromTrace(trace)).toBe(consensus.verdict);
}

describe('buildExplainabilityTrace / reproduceVerdictFromTrace (Sprint 6 task 6.3)', () => {
  it('reproduces the verdict from a full 9-expert opinion set (SPRINT_BOOK.md verification target)', () => {
    assertTraceReproducesVerdict(makeNineOpinions());
  });

  it('reproduces the verdict from a bearish-leaning mixed set', () => {
    assertTraceReproducesVerdict([
      makeOpinion({ expert: 'technical', verdict: 'bearish', confidence: 85, reasoning: ['breakdown'] }),
      makeOpinion({ expert: 'quant', verdict: 'moderately_bearish', confidence: 70, reasoning: ['sell signal'] }),
      makeOpinion({ expert: 'fundamental', verdict: 'neutral', confidence: 50, reasoning: ['mixed earnings'] }),
      makeOpinion({ expert: 'risk', verdict: 'bearish', confidence: 90, reasoning: ['high vol'] }),
    ]);
  });

  it('reproduces the verdict (neutral) from an empty opinion set', () => {
    assertTraceReproducesVerdict([]);
  });

  it('reproduces the verdict (neutral) from a risk/education-only set (both weight 0)', () => {
    assertTraceReproducesVerdict([
      makeOpinion({ expert: 'risk', verdict: 'bearish', confidence: 95, reasoning: ['volatile'] }),
      makeOpinion({ expert: 'education', verdict: 'neutral', confidence: 40, reasoning: ['explains consensus'] }),
    ]);
  });

  it('reproduces the verdict from a single strongly bullish domain opinion', () => {
    assertTraceReproducesVerdict([
      makeOpinion({ expert: 'technical', verdict: 'bullish', confidence: 88, reasoning: ['breakout'] }),
    ]);
  });

  it('includes one entry per raw opinion, in input order, regardless of inclusion', () => {
    const opinions = makeNineOpinions();
    const trace = buildExplainabilityTrace(opinions, computeConsensus(opinions));
    expect(trace.entries).toHaveLength(opinions.length);
    expect(trace.entries.map((e) => e.expert)).toEqual(opinions.map((o) => o.expert));
  });

  it('marks domain/strategy entries included with correct weight and nonzero contribution when confident+directional', () => {
    const opinions = makeNineOpinions();
    const consensus = computeConsensus(opinions);
    const trace = buildExplainabilityTrace(opinions, consensus);
    const technical = trace.entries.find((e) => e.expert === 'technical')!;
    expect(technical.included).toBe(true);
    expect(technical.weight).toBe(1);
    expect(technical.contribution).toBeGreaterThan(0);
  });

  it('marks risk and education entries excluded, with weight 0 and contribution 0', () => {
    const opinions = makeNineOpinions();
    const consensus = computeConsensus(opinions);
    const trace = buildExplainabilityTrace(opinions, consensus);
    const risk = trace.entries.find((e) => e.expert === 'risk')!;
    const education = trace.entries.find((e) => e.expert === 'education')!;
    expect(risk.included).toBe(false);
    expect(risk.weight).toBe(0);
    expect(risk.contribution).toBe(0);
    expect(education.included).toBe(false);
    expect(education.weight).toBe(0);
    expect(education.contribution).toBe(0);
  });

  it('preserves each opinion\'s full reasoning array in its entry', () => {
    const opinions = [makeOpinion({ expert: 'sector', reasoning: ['a', 'b', 'c'] })];
    const trace = buildExplainabilityTrace(opinions, computeConsensus(opinions));
    expect(trace.entries[0].reasoning).toEqual(['a', 'b', 'c']);
  });

  it('carries the consensus weightedScore/verdict/confidence through unchanged', () => {
    const opinions = makeNineOpinions();
    const consensus = computeConsensus(opinions);
    const trace = buildExplainabilityTrace(opinions, consensus);
    expect(trace.consensus).toEqual({
      weightedScore: consensus.weightedScore,
      verdict: consensus.verdict,
      confidence: consensus.confidence,
    });
  });

  it('produces a non-empty summary of plain strings, one line per entry plus header lines', () => {
    const opinions = makeNineOpinions();
    const trace = buildExplainabilityTrace(opinions, computeConsensus(opinions));
    expect(trace.summary.length).toBeGreaterThanOrEqual(opinions.length + 2);
    for (const line of trace.summary) {
      expect(typeof line).toBe('string');
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it('leaves riskGate undefined and adds no risk-gate summary line when none is supplied', () => {
    const opinions = makeNineOpinions();
    const trace = buildExplainabilityTrace(opinions, computeConsensus(opinions));
    expect(trace.riskGate).toBeUndefined();
    expect(trace.summary.some((l) => l.startsWith('Risk gate:'))).toBe(false);
  });

  it('populates riskGate and appends a risk-gate summary line when supplied (Level 1 veto)', () => {
    const opinions = makeNineOpinions();
    const consensus = computeConsensus(opinions);
    const riskGate = evaluateRiskGate({
      consensusConfidence: consensus.confidence,
      minConfidence: DEFAULT_MIN_CONFIDENCE,
      portfolio: makeHealthyPortfolio({ currentDrawdownPct: 10, maxDrawdownPct: 10 }),
      dataValid: true,
      minRiskRewardRatio: DEFAULT_MIN_RISK_REWARD_RATIO,
    });
    const trace = buildExplainabilityTrace(opinions, consensus, riskGate);
    expect(trace.riskGate).toEqual(riskGate);
    const riskLine = trace.summary.find((l) => l.startsWith('Risk gate:'));
    expect(riskLine).toBeDefined();
    expect(riskLine).toContain('Level 1');
    expect(riskLine).toContain('vetoed');
  });

  it('appends a mitigation note to the risk-gate summary line on a Level 2 result', () => {
    const opinions = makeNineOpinions();
    const consensus = computeConsensus(opinions);
    const riskGate = evaluateRiskGate({
      consensusConfidence: consensus.confidence,
      minConfidence: DEFAULT_MIN_CONFIDENCE,
      portfolio: makeHealthyPortfolio(),
      dataValid: true,
      minRiskRewardRatio: DEFAULT_MIN_RISK_REWARD_RATIO,
      riskOpinion: makeOpinion({ expert: 'risk', verdict: 'bearish', confidence: 80 }),
    });
    const trace = buildExplainabilityTrace(opinions, consensus, riskGate);
    const riskLine = trace.summary.find((l) => l.startsWith('Risk gate:'))!;
    expect(riskLine).toContain('Level 2');
    expect(riskLine).toContain('Mitigation applied');
  });

  it('is deterministic: identical input produces an identical trace on repeat calls', () => {
    const opinions = makeNineOpinions();
    const consensus = computeConsensus(opinions);
    expect(buildExplainabilityTrace(opinions, consensus)).toEqual(buildExplainabilityTrace(opinions, consensus));
  });
});
