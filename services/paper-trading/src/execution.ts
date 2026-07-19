import type { OrderRequest, Fill } from '@tradosphere/shared-types';
import type { PriceSource } from './price-source';

// Forge charter rule 2 (no silent fallbacks): a fill must be backed by a
// real tick already sitting in market_ticks. If none exists for the
// requested symbol -- never ingested, or the price source came back empty
// -- the order is rejected loudly. Nothing in this module ever invents,
// caches-as-fresh, or reuses a stale price to avoid a rejection.
export class NoMarketDataError extends Error {
  constructor(symbol: string) {
    super(`no market data available for symbol "${symbol}" -- order rejected, not filled at a fabricated price`);
    this.name = 'NoMarketDataError';
  }
}

export class InvalidOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrderError';
  }
}

function validateOrder(order: OrderRequest): void {
  if (!order.symbol || order.symbol.trim().length === 0) {
    throw new InvalidOrderError('order.symbol is required');
  }
  if (order.side !== 'buy' && order.side !== 'sell') {
    throw new InvalidOrderError(`order.side must be "buy" or "sell", got "${String(order.side)}"`);
  }
  if (!Number.isFinite(order.quantity) || order.quantity <= 0) {
    throw new InvalidOrderError(`order.quantity must be a positive finite number, got ${order.quantity}`);
  }
}

// Structurally compatible with PriceSource's RealTimePrice, but deliberately
// narrower (no `symbol`) -- computeFill takes the order's own symbol, so a
// caller can never accidentally stamp a fill with a price fetched for a
// different symbol than the one being ordered.
interface RealTimePriceLike {
  price: number;
  asOfIso: string;
}

// Pure: given an already-resolved real price, compute the fill. Market-order
// semantics only for Sprint 8 task 8.1 -- no limit/stop orders, and no
// invented slippage model layered on top of the reference price (Decision
// D14). The fill price *is* the latest real tick, exactly, so "fills use
// real market price, never fabricated" (8.1's verification criterion) is
// true by construction, not by convention.
export function computeFill(order: OrderRequest, price: RealTimePriceLike, filledAtIso: string): Fill {
  validateOrder(order);
  return {
    symbol: order.symbol,
    side: order.side,
    quantity: order.quantity,
    price: price.price,
    filledAtIso,
    priceAsOfIso: price.asOfIso,
  };
}

export interface PlaceOrderDeps {
  priceSource: PriceSource;
  // Injectable clock -- same reasoning as every other timestamped module in
  // this repo (e.g. cio's generatedAtIso tests): keeps fill-time assertions
  // exact instead of "close enough to Date.now()".
  now?: () => Date;
}

// Orchestration: validate first (a malformed order never reaches the data
// layer), fetch the real latest price, then compute the fill.
export async function placeOrder(order: OrderRequest, deps: PlaceOrderDeps): Promise<Fill> {
  validateOrder(order);

  const price = await deps.priceSource.getLatestPrice(order.symbol);
  if (!price) {
    throw new NoMarketDataError(order.symbol);
  }

  const now = deps.now ?? (() => new Date());
  return computeFill(order, price, now().toISOString());
}
