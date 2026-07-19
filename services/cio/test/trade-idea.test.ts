import { describe, it, expect } from 'vitest';
import {
  generateTradeIdea,
  DEFAULT_STOP_LOSS_PCT,
  DEFAULT_TARGET_RISK_REWARD_RATIO,
  type TradeIdeaInput,
} from '../src/trade-idea';
import type { Verdict } from '@tradosphere/shared-types';

function baseInput(overrides: Partial<TradeIdeaInput> = {}): TradeIdeaInput {
  return {
    symbol: 'RELIANCE',
    verdict: 'bullish',
    referencePrice: 100,
    ...overrides,
  };
}

describe('generateTradeIdea (Sprint 6 task 6.4)', () => {
  it('generates a long idea with correct entry/stopLoss/target/R:R on the default policy (SPRINT_BOOK.md verification target)', () => {
    const idea = generateTradeIdea(baseInput({ verdict: 'bullish', referencePrice: 100 }));
    expect(idea).toEqual({
      symbol: 'RELIANCE',
      direction: 'long',
      entry: 100,
      stopLoss: 98,
      target: 104,
      riskRewardRatio: 2,
    });
  });

  it('generates a short idea with correct entry/stopLoss/target/R:R on the default policy', () => {
    const idea = generateTradeIdea(baseInput({ verdict: 'bearish', referencePrice: 100 }));
    expect(idea).toEqual({
      symbol: 'RELIANCE',
      direction: 'short',
      entry: 100,
      stopLoss: 102,
      target: 96,
      riskRewardRatio: 2,
    });
  });

  it('moderately_bullish also produces a long idea', () => {
    const idea = generateTradeIdea(baseInput({ verdict: 'moderately_bullish' }));
    expect(idea?.direction).toBe('long');
  });

  it('moderately_bearish also produces a short idea', () => {
    const idea = generateTradeIdea(baseInput({ verdict: 'moderately_bearish' }));
    expect(idea?.direction).toBe('short');
  });

  it('returns undefined for a neutral verdict rather than fabricating a direction', () => {
    expect(generateTradeIdea(baseInput({ verdict: 'neutral' }))).toBeUndefined();
  });

  it('honors a custom stopLossPct and targetRiskRewardRatio', () => {
    const idea = generateTradeIdea(
      baseInput({ verdict: 'bullish', referencePrice: 100, stopLossPct: 1, targetRiskRewardRatio: 3 }),
    );
    expect(idea).toEqual({
      symbol: 'RELIANCE',
      direction: 'long',
      entry: 100,
      stopLoss: 99,
      target: 103,
      riskRewardRatio: 3,
    });
  });

  it('falls back to the named default constants when stopLossPct/targetRiskRewardRatio are omitted', () => {
    const withDefaults = generateTradeIdea(baseInput({ verdict: 'bullish' }));
    const withExplicitDefaults = generateTradeIdea(
      baseInput({ verdict: 'bullish', stopLossPct: DEFAULT_STOP_LOSS_PCT, targetRiskRewardRatio: DEFAULT_TARGET_RISK_REWARD_RATIO }),
    );
    expect(withDefaults).toEqual(withExplicitDefaults);
  });

  it.each<[Verdict, number, number, number]>([
    ['bullish', 100, 2, 2],
    ['bearish', 250.5, 1.5, 2.5],
    ['moderately_bullish', 47.25, 3, 1],
    ['moderately_bearish', 999.99, 0.5, 4],
  ])(
    'riskRewardRatio always equals |target-entry| / |entry-stopLoss| computed from the returned numbers (%s @ %d)',
    (verdict, referencePrice, stopLossPct, targetRiskRewardRatio) => {
      const idea = generateTradeIdea(baseInput({ verdict, referencePrice, stopLossPct, targetRiskRewardRatio }));
      expect(idea).toBeDefined();
      const expectedRatio = Math.round((Math.abs(idea!.target - idea!.entry) / Math.abs(idea!.entry - idea!.stopLoss)) * 100) / 100;
      expect(idea!.riskRewardRatio).toBe(expectedRatio);
    },
  );

  it('a long idea always has target > entry > stopLoss', () => {
    const idea = generateTradeIdea(baseInput({ verdict: 'bullish', referencePrice: 250.5, stopLossPct: 1.5, targetRiskRewardRatio: 2.5 }));
    expect(idea!.target).toBeGreaterThan(idea!.entry);
    expect(idea!.entry).toBeGreaterThan(idea!.stopLoss);
  });

  it('a short idea always has target < entry < stopLoss', () => {
    const idea = generateTradeIdea(baseInput({ verdict: 'bearish', referencePrice: 250.5, stopLossPct: 1.5, targetRiskRewardRatio: 2.5 }));
    expect(idea!.target).toBeLessThan(idea!.entry);
    expect(idea!.entry).toBeLessThan(idea!.stopLoss);
  });

  it('passes through an educationNote when supplied', () => {
    const idea = generateTradeIdea(baseInput({ verdict: 'bullish', educationNote: 'breakout continuation setup' }));
    expect(idea!.educationNote).toBe('breakout continuation setup');
  });

  it('omits educationNote when not supplied', () => {
    const idea = generateTradeIdea(baseInput({ verdict: 'bullish' }));
    expect(idea!.educationNote).toBeUndefined();
  });

  it('throws when symbol is empty', () => {
    expect(() => generateTradeIdea(baseInput({ symbol: '' }))).toThrow(/symbol/);
  });

  it('throws when referencePrice is zero or negative', () => {
    expect(() => generateTradeIdea(baseInput({ referencePrice: 0 }))).toThrow(/referencePrice/);
    expect(() => generateTradeIdea(baseInput({ referencePrice: -5 }))).toThrow(/referencePrice/);
  });

  it('throws when referencePrice is not finite', () => {
    expect(() => generateTradeIdea(baseInput({ referencePrice: Number.NaN }))).toThrow(/referencePrice/);
    expect(() => generateTradeIdea(baseInput({ referencePrice: Number.POSITIVE_INFINITY }))).toThrow(/referencePrice/);
  });

  it('throws when stopLossPct is out of the (0, 100) range', () => {
    expect(() => generateTradeIdea(baseInput({ stopLossPct: 0 }))).toThrow(/stopLossPct/);
    expect(() => generateTradeIdea(baseInput({ stopLossPct: 100 }))).toThrow(/stopLossPct/);
    expect(() => generateTradeIdea(baseInput({ stopLossPct: -1 }))).toThrow(/stopLossPct/);
  });

  it('throws when targetRiskRewardRatio is zero or negative', () => {
    expect(() => generateTradeIdea(baseInput({ targetRiskRewardRatio: 0 }))).toThrow(/targetRiskRewardRatio/);
    expect(() => generateTradeIdea(baseInput({ targetRiskRewardRatio: -2 }))).toThrow(/targetRiskRewardRatio/);
  });

  it('throws rather than emitting a degenerate idea when the stop-loss distance rounds away to zero', () => {
    expect(() => generateTradeIdea(baseInput({ referencePrice: 1, stopLossPct: 0.001 }))).toThrow(/stopLoss/);
  });

  it('is deterministic: identical input produces identical output on repeat calls', () => {
    const input = baseInput({ verdict: 'bullish', referencePrice: 100 });
    expect(generateTradeIdea(input)).toEqual(generateTradeIdea(input));
  });
});
