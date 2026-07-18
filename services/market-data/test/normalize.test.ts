import { describe, it, expect } from 'vitest';
import type { RawBrokerTick } from '@tradosphere/broker-core';
import { normalizeTick, InvalidTickError } from '../src/normalize';

function validRaw(overrides: Partial<RawBrokerTick> = {}): RawBrokerTick {
  return {
    tradingSymbol: 'RELIANCE',
    lastTradedPrice: 2500.5,
    tradedQty: 120,
    exchangeTimestamp: '2026-01-01T09:15:00.000Z',
    ...overrides,
  };
}

// Sprint 3 task 3.3 exit criterion: "normalized ticks match schema on sample
// feed." This is the one place a broker-native shape becomes the shared
// MarketTick contract -- every failure mode below must throw InvalidTickError
// rather than silently coerce bad data into a tick.
describe('normalizeTick', () => {
  it('maps a valid raw broker tick onto the shared MarketTick schema', () => {
    const tick = normalizeTick(validRaw());
    expect(tick).toEqual({
      symbol: 'RELIANCE',
      price: 2500.5,
      volume: 120,
      timestampIso: '2026-01-01T09:15:00.000Z',
    });
  });

  it('rejects a missing/blank trading symbol', () => {
    expect(() => normalizeTick(validRaw({ tradingSymbol: '' }))).toThrow(InvalidTickError);
    expect(() => normalizeTick(validRaw({ tradingSymbol: '   ' }))).toThrow(InvalidTickError);
  });

  it('rejects a non-positive price', () => {
    expect(() => normalizeTick(validRaw({ lastTradedPrice: 0 }))).toThrow(InvalidTickError);
    expect(() => normalizeTick(validRaw({ lastTradedPrice: -5 }))).toThrow(InvalidTickError);
  });

  it('rejects a non-finite price', () => {
    expect(() => normalizeTick(validRaw({ lastTradedPrice: Number.NaN }))).toThrow(InvalidTickError);
    expect(() => normalizeTick(validRaw({ lastTradedPrice: Number.POSITIVE_INFINITY }))).toThrow(InvalidTickError);
  });

  it('rejects a negative volume', () => {
    expect(() => normalizeTick(validRaw({ tradedQty: -1 }))).toThrow(InvalidTickError);
  });

  it('rejects an unparseable timestamp', () => {
    expect(() => normalizeTick(validRaw({ exchangeTimestamp: 'not-a-date' }))).toThrow(InvalidTickError);
  });
});
