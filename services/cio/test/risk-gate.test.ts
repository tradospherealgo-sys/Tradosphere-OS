import { describe, it, expect } from 'vitest';
import { evaluateRiskGate, DEFAULT_MIN_CONFIDENCE, DEFAULT_MIN_RISK_REWARD_RATIO, type RiskGateInput } from '../src/risk-gate';
import { makeHealthyPortfolio, makeOpinion } from './fixtures';

function baseInput(overrides: Partial<RiskGateInput> = {}): RiskGateInput {
  return {
    consensusConfidence: 70,
    minConfidence: DEFAULT_MIN_CONFIDENCE,
    portfolio: makeHealthyPortfolio(),
    dataValid: true,
    minRiskRewardRatio: DEFAULT_MIN_RISK_REWARD_RATIO,
    ...overrides,
  };
}

describe('evaluateRiskGate (Sprint 6 task 6.2)', () => {
  it('Level 1: vetoes a bad idea on risk:reward below the minimum (SPRINT_BOOK.md verification target)', () => {
    const result = evaluateRiskGate(baseInput({ candidateTradeIdea: { riskRewardRatio: 0.8 } }));
    expect(result.level).toBe(1);
    expect(result.approved).toBe(false);
    expect(result.reasons.some((r) => r.includes('risk:reward'))).toBe(true);
    expect(result.mitigation).toBeUndefined();
  });

  it('Level 1: vetoes when drawdown is at or over the portfolio limit', () => {
    const result = evaluateRiskGate(baseInput({ portfolio: makeHealthyPortfolio({ currentDrawdownPct: 10, maxDrawdownPct: 10 }) }));
    expect(result.level).toBe(1);
    expect(result.approved).toBe(false);
    expect(result.reasons.some((r) => r.includes('drawdown'))).toBe(true);
  });

  it('Level 1: vetoes when exposure is at or over the portfolio limit', () => {
    const result = evaluateRiskGate(baseInput({ portfolio: makeHealthyPortfolio({ currentExposurePct: 85, maxExposurePct: 80 }) }));
    expect(result.level).toBe(1);
    expect(result.approved).toBe(false);
    expect(result.reasons.some((r) => r.includes('exposure'))).toBe(true);
  });

  it('Level 1: vetoes on invalid/missing data', () => {
    const result = evaluateRiskGate(baseInput({ dataValid: false }));
    expect(result.level).toBe(1);
    expect(result.approved).toBe(false);
    expect(result.reasons.some((r) => r.includes('data'))).toBe(true);
  });

  it('Level 1: vetoes when consensus confidence is below the minimum', () => {
    const result = evaluateRiskGate(baseInput({ consensusConfidence: 20, minConfidence: 40 }));
    expect(result.level).toBe(1);
    expect(result.approved).toBe(false);
    expect(result.reasons.some((r) => r.includes('confidence'))).toBe(true);
  });

  it('Level 1: collects every violated reason at once, not just the first', () => {
    const result = evaluateRiskGate(
      baseInput({
        dataValid: false,
        consensusConfidence: 10,
        minConfidence: 40,
        portfolio: makeHealthyPortfolio({ currentDrawdownPct: 15, maxDrawdownPct: 10 }),
      }),
    );
    expect(result.level).toBe(1);
    expect(result.reasons).toHaveLength(3);
  });

  it('Level 1 is absolute: a veto holds even when every other signal is excellent', () => {
    const result = evaluateRiskGate(
      baseInput({
        consensusConfidence: 99,
        candidateTradeIdea: { riskRewardRatio: 5 },
        riskOpinion: makeOpinion({ expert: 'risk', verdict: 'bullish', confidence: 99 }),
        portfolio: makeHealthyPortfolio({ currentDrawdownPct: 10, maxDrawdownPct: 10 }),
      }),
    );
    expect(result.level).toBe(1);
    expect(result.approved).toBe(false);
  });

  it('Level 2: mitigates (does not block) when Risk agent reads unfavorable but no hard limit is breached', () => {
    const result = evaluateRiskGate(
      baseInput({ riskOpinion: makeOpinion({ expert: 'risk', verdict: 'bearish', confidence: 80 }) }),
    );
    expect(result.level).toBe(2);
    expect(result.approved).toBe(true);
    expect(result.mitigation).toEqual({
      positionSizeMultiplier: 0.5,
      leverageMultiplier: 0.5,
      note: 'position size and leverage halved, execution parameters tightened, per Level 2 risk mitigation',
    });
  });

  it('Level 2: mitigates when drawdown is within 80% of its hard limit', () => {
    const result = evaluateRiskGate(baseInput({ portfolio: makeHealthyPortfolio({ currentDrawdownPct: 9, maxDrawdownPct: 10 }) }));
    expect(result.level).toBe(2);
    expect(result.approved).toBe(true);
    expect(result.mitigation).toBeDefined();
  });

  it('Level 2: mitigates when exposure is within 80% of its hard limit', () => {
    const result = evaluateRiskGate(baseInput({ portfolio: makeHealthyPortfolio({ currentExposurePct: 70, maxExposurePct: 80 }) }));
    expect(result.level).toBe(2);
    expect(result.approved).toBe(true);
  });

  it('moderately_bearish Risk reads also trigger Level 2 (not just outright bearish)', () => {
    const result = evaluateRiskGate(
      baseInput({ riskOpinion: makeOpinion({ expert: 'risk', verdict: 'moderately_bearish', confidence: 60 }) }),
    );
    expect(result.level).toBe(2);
  });

  it('Level 3: fully approves a healthy portfolio with a favorable/neutral risk read and a solid R:R', () => {
    const result = evaluateRiskGate(
      baseInput({
        riskOpinion: makeOpinion({ expert: 'risk', verdict: 'bullish', confidence: 80 }),
        candidateTradeIdea: { riskRewardRatio: 2.5 },
      }),
    );
    expect(result.level).toBe(3);
    expect(result.approved).toBe(true);
    expect(result.mitigation).toBeUndefined();
  });

  it('Level 3: no candidate trade idea and no Risk opinion supplied does not itself force a veto', () => {
    const result = evaluateRiskGate(baseInput());
    expect(result.level).toBe(3);
    expect(result.approved).toBe(true);
  });

  it('is deterministic: identical input produces identical output on repeat calls', () => {
    const input = baseInput({ riskOpinion: makeOpinion({ expert: 'risk', verdict: 'bearish', confidence: 55 }) });
    expect(evaluateRiskGate(input)).toEqual(evaluateRiskGate(input));
  });
});
