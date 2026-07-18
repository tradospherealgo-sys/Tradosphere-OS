import { describe, it, expect } from 'vitest';
import type { ExpertOpinion } from '@tradosphere/shared-types';
import { assertValidOpinion, InvalidOpinionError } from '../src/opinion-schema';

function validOpinion(overrides: Partial<ExpertOpinion> = {}): ExpertOpinion {
  return {
    expert: 'technical',
    verdict: 'bullish',
    confidence: 72,
    reasoning: ['RSI above 60', 'price above EMA20'],
    generatedAtIso: new Date().toISOString(),
    ...overrides,
  };
}

describe('assertValidOpinion (Sprint 5 task 5.1)', () => {
  it('accepts a fully valid opinion', () => {
    expect(() => assertValidOpinion(validOpinion())).not.toThrow();
  });

  it('rejects an unknown expert name', () => {
    expect(() => assertValidOpinion(validOpinion({ expert: 'astrology' as never }))).toThrow(InvalidOpinionError);
  });

  it('rejects an unknown verdict', () => {
    expect(() => assertValidOpinion(validOpinion({ verdict: 'super_bullish' as never }))).toThrow(InvalidOpinionError);
  });

  it('rejects a non-finite confidence', () => {
    expect(() => assertValidOpinion(validOpinion({ confidence: Number.NaN }))).toThrow(InvalidOpinionError);
  });

  it('rejects a confidence outside the 0-100 range', () => {
    expect(() => assertValidOpinion(validOpinion({ confidence: 150 }))).toThrow(InvalidOpinionError);
    expect(() => assertValidOpinion(validOpinion({ confidence: -1 }))).toThrow(InvalidOpinionError);
  });

  it('rejects an empty reasoning array', () => {
    expect(() => assertValidOpinion(validOpinion({ reasoning: [] }))).toThrow(InvalidOpinionError);
  });

  it('rejects a reasoning array containing a blank string', () => {
    expect(() => assertValidOpinion(validOpinion({ reasoning: ['fine', '   '] }))).toThrow(InvalidOpinionError);
  });

  it('rejects an unparseable generatedAtIso', () => {
    expect(() => assertValidOpinion(validOpinion({ generatedAtIso: 'not-a-date' }))).toThrow(InvalidOpinionError);
  });
});
