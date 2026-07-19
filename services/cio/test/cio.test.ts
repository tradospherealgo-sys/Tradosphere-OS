import { describe, it, expect } from 'vitest';
import { buildCioVerdict } from '../src/cio';
import { computeConsensus } from '../src/consensus';
import { makeOpinion, makeNineOpinions, makeHealthyPortfolio } from './fixtures';

// Task 6.5 (Atlas's walkthrough closure): buildCioVerdict() is the composed
// "CIO gives final verdict" engine -- these tests exercise it end to end,
// proving 6.1 (consensus), 6.2 (risk gate), 6.3 (trace), and 6.4 (trade
// idea) are wired together exactly per Decision D8's stated policy, not
// just individually correct in isolation.

describe('buildCioVerdict (Sprint 6 task 6.5)', () => {
  it('produces the consensus verdict/confidence and a Level 2 mitigated trade idea on the 9-opinion fixture', () => {
    const opinions = makeNineOpinions();
    const consensus = computeConsensus(opinions);
    const result = buildCioVerdict({
      symbol: 'RELIANCE',
      opinions,
      referencePrice: 100,
      portfolio: makeHealthyPortfolio(),
      dataValid: true,
    });

    // Verdict/confidence are the consensus's own, unaltered by the gate.
    expect(result.verdict).toBe(consensus.verdict);
    expect(result.verdict).toBe('bullish');
    expect(result.confidence).toBe(74);
    expect(result.opinions).toEqual(opinions);

    // makeNineOpinions()'s Risk opinion is bearish -> Level 2 mitigate, not a veto.
    expect(result.riskGate.level).toBe(2);
    expect(result.riskGate.approved).toBe(true);
    expect(result.riskGate.mitigation).toBeDefined();

    // Level 2 ships the idea unmodified (mitigation adjusts position sizing,
    // not price levels) -- default 2%/2:1 policy on referencePrice 100.
    // educationNote comes from makeNineOpinions()'s own 'education' entry
    // (Decision D13) -- proving the annotation rides along automatically,
    // not just that the field exists.
    expect(result.tradeIdeas).toEqual([
      {
        symbol: 'RELIANCE',
        direction: 'long',
        entry: 100,
        stopLoss: 98,
        target: 104,
        riskRewardRatio: 2,
        educationNote: 'explains the group consensus',
      },
    ]);

    // The trace's own recorded riskGate is the exact same object the top-level result carries.
    expect(result.trace.riskGate).toEqual(result.riskGate);
  });

  it('leaves educationNote unset when no Education opinion is supplied (Decision D13: no fabrication)', () => {
    const opinions = [
      makeOpinion({ expert: 'technical', verdict: 'bullish', confidence: 80 }),
      makeOpinion({ expert: 'risk', verdict: 'bullish', confidence: 80 }),
    ];
    const result = buildCioVerdict({
      symbol: 'TCS',
      opinions,
      referencePrice: 200,
      portfolio: makeHealthyPortfolio(),
      dataValid: true,
    });
    expect(result.tradeIdeas).toHaveLength(1);
    expect(result.tradeIdeas[0].educationNote).toBeUndefined();
  });

  it('leaves educationNote unset rather than fabricating one when the Education opinion has empty reasoning', () => {
    const opinions = [
      makeOpinion({ expert: 'technical', verdict: 'bullish', confidence: 80 }),
      makeOpinion({ expert: 'risk', verdict: 'bullish', confidence: 80 }),
      makeOpinion({ expert: 'education', verdict: 'neutral', confidence: 40, reasoning: [] }),
    ];
    const result = buildCioVerdict({
      symbol: 'TCS',
      opinions,
      referencePrice: 200,
      portfolio: makeHealthyPortfolio(),
      dataValid: true,
    });
    expect(result.tradeIdeas).toHaveLength(1);
    expect(result.tradeIdeas[0].educationNote).toBeUndefined();
  });

  it('ships zero trade ideas on a Level 1 veto (bad risk:reward), while still reporting the verdict and trace (Decision D8: never override a Level 1 veto)', () => {
    const opinions = makeNineOpinions();
    const result = buildCioVerdict({
      symbol: 'RELIANCE',
      opinions,
      referencePrice: 100,
      portfolio: makeHealthyPortfolio(),
      dataValid: true,
      targetRiskRewardRatio: 1, // below DEFAULT_MIN_RISK_REWARD_RATIO (1.5)
    });

    expect(result.riskGate.level).toBe(1);
    expect(result.riskGate.approved).toBe(false);
    expect(result.riskGate.reasons.some((r) => r.includes('risk:reward'))).toBe(true);
    expect(result.tradeIdeas).toEqual([]);

    // The verdict/confidence/trace are still reported -- a veto blocks the
    // trade idea, not the explanation of what the CIO concluded and why.
    expect(result.verdict).toBe('bullish');
    expect(result.confidence).toBe(74);
    expect(result.trace.entries).toHaveLength(9);
    expect(result.trace.summary.length).toBeGreaterThan(0);
  });

  it('ships zero trade ideas on a Level 1 veto from portfolio drawdown at the limit', () => {
    const result = buildCioVerdict({
      symbol: 'RELIANCE',
      opinions: makeNineOpinions(),
      referencePrice: 100,
      portfolio: makeHealthyPortfolio({ currentDrawdownPct: 10, maxDrawdownPct: 10 }),
      dataValid: true,
    });
    expect(result.riskGate.level).toBe(1);
    expect(result.riskGate.approved).toBe(false);
    expect(result.tradeIdeas).toEqual([]);
  });

  it('ships zero trade ideas on a Level 1 veto from invalid upstream data', () => {
    const result = buildCioVerdict({
      symbol: 'RELIANCE',
      opinions: makeNineOpinions(),
      referencePrice: 100,
      portfolio: makeHealthyPortfolio(),
      dataValid: false,
    });
    expect(result.riskGate.level).toBe(1);
    expect(result.tradeIdeas).toEqual([]);
  });

  it('fully approves (Level 3) and ships the trade idea when nothing is near a limit and Risk reads favorably', () => {
    const opinions = [
      makeOpinion({ expert: 'technical', verdict: 'bullish', confidence: 80 }),
      makeOpinion({ expert: 'risk', verdict: 'bullish', confidence: 80 }),
    ];
    const result = buildCioVerdict({
      symbol: 'TCS',
      opinions,
      referencePrice: 200,
      portfolio: makeHealthyPortfolio(),
      dataValid: true,
    });
    expect(result.riskGate.level).toBe(3);
    expect(result.riskGate.approved).toBe(true);
    expect(result.riskGate.mitigation).toBeUndefined();
    expect(result.tradeIdeas).toHaveLength(1);
  });

  it('generates no trade idea for a neutral consensus verdict, even when the risk gate would otherwise approve', () => {
    // technical bullish(+2 @80) and quant bearish(-2 @80) cancel exactly ->
    // weightedScore 0 -> neutral, at a confidence (80) comfortably above the
    // gate's minimum -- isolating "neutral suppresses idea generation" from
    // "the gate blocked it".
    const opinions = [
      makeOpinion({ expert: 'technical', verdict: 'bullish', confidence: 80 }),
      makeOpinion({ expert: 'quant', verdict: 'bearish', confidence: 80 }),
    ];
    const consensus = computeConsensus(opinions);
    expect(consensus.verdict).toBe('neutral');
    expect(consensus.confidence).toBe(80);

    const result = buildCioVerdict({
      symbol: 'INFY',
      opinions,
      referencePrice: 100,
      portfolio: makeHealthyPortfolio(),
      dataValid: true,
    });
    expect(result.verdict).toBe('neutral');
    expect(result.riskGate.approved).toBe(true);
    expect(result.riskGate.level).toBe(3);
    expect(result.tradeIdeas).toEqual([]);
  });

  it('stamps a valid, current generatedAtIso timestamp', () => {
    const before = Date.now();
    const result = buildCioVerdict({
      symbol: 'RELIANCE',
      opinions: makeNineOpinions(),
      referencePrice: 100,
      portfolio: makeHealthyPortfolio(),
      dataValid: true,
    });
    const after = Date.now();
    const stamped = Date.parse(result.generatedAtIso);
    expect(Number.isNaN(stamped)).toBe(false);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  it('is deterministic apart from the timestamp: identical input produces identical verdict/confidence/opinions/tradeIdeas/riskGate/trace', () => {
    const opinions = makeNineOpinions();
    const input = { symbol: 'RELIANCE', opinions, referencePrice: 100, portfolio: makeHealthyPortfolio(), dataValid: true };
    const a = buildCioVerdict(input);
    const b = buildCioVerdict(input);
    expect(a.verdict).toBe(b.verdict);
    expect(a.confidence).toBe(b.confidence);
    expect(a.opinions).toEqual(b.opinions);
    expect(a.tradeIdeas).toEqual(b.tradeIdeas);
    expect(a.riskGate).toEqual(b.riskGate);
    expect(a.trace).toEqual(b.trace);
  });
});
