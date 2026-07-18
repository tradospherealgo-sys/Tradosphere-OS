import type { RawBrokerTick } from '@tradosphere/broker-core';
import type { MarketTick } from '@tradosphere/shared-types';

// This is the one place a broker-native tick shape becomes the shared
// `MarketTick` contract every other service (research, ai council, cio
// engine, frontend) depends on. Whatever real broker adapter eventually
// replaces `SimulatedBrokerClient`, it must still produce `RawBrokerTick`s --
// this function is what keeps the rest of the platform broker-agnostic.
export class InvalidTickError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTickError';
  }
}

export function normalizeTick(raw: RawBrokerTick): MarketTick {
  if (!raw.tradingSymbol || raw.tradingSymbol.trim().length === 0) {
    throw new InvalidTickError('raw tick missing tradingSymbol');
  }
  if (!Number.isFinite(raw.lastTradedPrice) || raw.lastTradedPrice <= 0) {
    throw new InvalidTickError(`raw tick has non-positive/invalid price: ${raw.lastTradedPrice}`);
  }
  if (!Number.isFinite(raw.tradedQty) || raw.tradedQty < 0) {
    throw new InvalidTickError(`raw tick has invalid volume: ${raw.tradedQty}`);
  }
  const timestampMs = Date.parse(raw.exchangeTimestamp);
  if (Number.isNaN(timestampMs)) {
    throw new InvalidTickError(`raw tick has unparseable exchangeTimestamp: ${raw.exchangeTimestamp}`);
  }

  return {
    symbol: raw.tradingSymbol,
    price: raw.lastTradedPrice,
    volume: raw.tradedQty,
    timestampIso: new Date(timestampMs).toISOString(),
  };
}
