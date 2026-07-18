import type { MarketTick } from '@tradosphere/shared-types';
import type { InsertResult, MarketDataRepository } from '../src/repository';

// In-memory test double for the repository port, mirroring the real
// DrizzleMarketDataRepository's (symbol, timestampIso) ON CONFLICT DO NOTHING
// idempotency -- same "test against the port, not the adapter" approach used
// by services/auth/test/fakes.ts.
export class InMemoryMarketDataRepository implements MarketDataRepository {
  public readonly stored = new Map<string, MarketTick>();

  async insertTicks(ticks: MarketTick[]): Promise<InsertResult> {
    let inserted = 0;
    for (const tick of ticks) {
      const key = `${tick.symbol}:${tick.timestampIso}`;
      if (this.stored.has(key)) continue;
      this.stored.set(key, tick);
      inserted += 1;
    }
    return { requested: ticks.length, inserted, skipped: ticks.length - inserted };
  }
}

export function silentInfoLogger(): { info: () => void } {
  return { info: () => {} };
}

export function silentServiceLogger(): { info: () => void; error: () => void } {
  return { info: () => {}, error: () => {} };
}
