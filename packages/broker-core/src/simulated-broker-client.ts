// FOR DEVELOPMENT/TESTING ONLY.
//
// This client fabricates synthetic ticks locally -- it never talks to a real
// exchange or broker. It exists purely so Sprint 3 (and everything that
// depends on market data downstream) can be built and genuinely tested while
// SMC Global's real API is not yet public (EXECUTION_BOOK.md decision D5).
//
// It must never be wired into anything that presents its output as real
// market data to an end user. Swapping in a real `BrokerClient`
// implementation (e.g. a future `SmcGlobalBrokerClient`) requires no changes
// to any consumer -- that is the entire point of the `BrokerClient` port.
import type { BrokerClient } from './broker-client';
import { BrokerAuthError, BrokerOutageError } from './errors';
import { hashString, mulberry32 } from './prng';
import type { RawBrokerTick, Unsubscribe } from './types';

interface Subscriber {
  onTick: (tick: RawBrokerTick) => void;
  onError?: (err: Error) => void;
}

const ONE_MINUTE_MS = 60_000;

function seedPrice(symbol: string): number {
  return 100 + (hashString(symbol) % 900); // deterministic starting price, 100-999
}

export class SimulatedBrokerClient implements BrokerClient {
  private authenticated = false;
  private outage = false;
  private readonly prices = new Map<string, number>();
  private readonly subscriptions = new Map<string, Set<Subscriber>>();
  private intervalHandle?: NodeJS.Timeout;

  constructor(private readonly tickIntervalMs = 1000) {}

  async authenticate(): Promise<void> {
    if (this.outage) {
      throw new BrokerOutageError('simulated feed outage during authenticate');
    }
    this.authenticated = true;
  }

  async getHistoricalTicks(symbol: string, fromIso: string, toIso: string): Promise<RawBrokerTick[]> {
    this.assertAuthenticated();
    if (this.outage) {
      throw new BrokerOutageError(`simulated feed outage while fetching historical ticks for ${symbol}`);
    }

    const from = new Date(fromIso).getTime();
    const to = new Date(toIso).getTime();
    if (Number.isNaN(from) || Number.isNaN(to) || from >= to) {
      throw new RangeError(`invalid historical range: ${fromIso} -> ${toIso}`);
    }

    const ticks: RawBrokerTick[] = [];
    let price = seedPrice(symbol);
    let index = 0;
    for (let ts = from; ts < to; ts += ONE_MINUTE_MS, index += 1) {
      // Deterministic per (symbol, index) -- same range requested twice
      // yields byte-identical ticks, which is what makes the historical
      // import idempotency test (3.5) meaningful.
      const rand = mulberry32(hashString(`${symbol}:${index}`))();
      price = Math.max(1, price * (1 + (rand - 0.5) * 0.01));
      ticks.push({
        tradingSymbol: symbol,
        lastTradedPrice: Number(price.toFixed(2)),
        tradedQty: 100 + Math.floor(rand * 900),
        exchangeTimestamp: new Date(ts).toISOString(),
      });
    }
    return ticks;
  }

  subscribeTicks(symbols: string[], onTick: (tick: RawBrokerTick) => void, onError?: (err: Error) => void): Unsubscribe {
    this.assertAuthenticated();
    const subscriber: Subscriber = { onTick, onError };
    for (const symbol of symbols) {
      if (!this.subscriptions.has(symbol)) {
        this.subscriptions.set(symbol, new Set());
      }
      this.subscriptions.get(symbol)!.add(subscriber);
    }

    if (!this.intervalHandle) {
      this.intervalHandle = setInterval(() => {
        for (const symbol of this.subscriptions.keys()) {
          this.emit(symbol);
        }
      }, this.tickIntervalMs);
      // Don't let this timer keep a test runner or short-lived script alive.
      this.intervalHandle.unref?.();
    }

    return () => {
      for (const symbol of symbols) {
        this.subscriptions.get(symbol)?.delete(subscriber);
      }
    };
  }

  // Test/dev-only hook: forces immediate synchronous delivery of the next
  // tick for `symbol` to all current subscribers, bypassing the interval.
  // Lets tests assert on stream delivery without depending on real timers.
  forceTick(symbol: string): void {
    this.emit(symbol);
  }

  // Test/dev-only hook: flips the client into/out of a simulated outage.
  // While active, both historical and live-stream calls fail loudly with
  // BrokerOutageError instead of silently returning stale/fake data.
  simulateOutage(active: boolean): void {
    this.outage = active;
  }

  async disconnect(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
    this.subscriptions.clear();
    this.authenticated = false;
  }

  private emit(symbol: string): void {
    const subs = this.subscriptions.get(symbol);
    if (!subs || subs.size === 0) return;

    if (this.outage) {
      const err = new BrokerOutageError(`simulated feed outage while streaming ${symbol}`);
      for (const sub of subs) sub.onError?.(err);
      return;
    }

    const tick = this.nextTick(symbol);
    for (const sub of subs) sub.onTick(tick);
  }

  private nextTick(symbol: string): RawBrokerTick {
    const prev = this.prices.get(symbol) ?? seedPrice(symbol);
    const rand = Math.random();
    const next = Math.max(1, prev * (1 + (rand - 0.5) * 0.01));
    this.prices.set(symbol, next);
    return {
      tradingSymbol: symbol,
      lastTradedPrice: Number(next.toFixed(2)),
      tradedQty: 100 + Math.floor(Math.random() * 900),
      exchangeTimestamp: new Date().toISOString(),
    };
  }

  private assertAuthenticated(): void {
    if (!this.authenticated) {
      throw new BrokerAuthError('SimulatedBrokerClient used before authenticate()');
    }
  }
}
