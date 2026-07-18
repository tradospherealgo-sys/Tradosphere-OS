import { marketTicks, type Database } from '@tradosphere/database';
import type { MarketTick } from '@tradosphere/shared-types';

export interface InsertResult {
  requested: number;
  inserted: number;
  skipped: number;
}

// Port every consumer (live ingestion, historical import) depends on.
// `DrizzleMarketDataRepository` is the real implementation; tests use an
// in-memory double (test/fakes.ts) -- same pattern as services/auth's
// UserRepository/SessionRepository in Sprint 2.
export interface MarketDataRepository {
  insertTicks(ticks: MarketTick[]): Promise<InsertResult>;
}

export class DrizzleMarketDataRepository implements MarketDataRepository {
  constructor(private readonly db: Database) {}

  async insertTicks(ticks: MarketTick[]): Promise<InsertResult> {
    if (ticks.length === 0) {
      return { requested: 0, inserted: 0, skipped: 0 };
    }

    // ON CONFLICT (symbol, tick_timestamp) DO NOTHING is what makes both live
    // ingestion and historical import idempotent -- re-delivering/re-importing
    // a tick we already have is a silent no-op, never a duplicate row.
    // `.returning()` only yields rows that were actually inserted, which is
    // how we get an accurate inserted/skipped count to log (Sprint 3 task 3.5
    // requires row counts to be logged).
    const inserted = await this.db
      .insert(marketTicks)
      .values(
        ticks.map((t) => ({
          symbol: t.symbol,
          price: t.price,
          volume: t.volume,
          tickTimestamp: new Date(t.timestampIso),
        })),
      )
      .onConflictDoNothing({ target: [marketTicks.symbol, marketTicks.tickTimestamp] })
      .returning({ id: marketTicks.id });

    return {
      requested: ticks.length,
      inserted: inserted.length,
      skipped: ticks.length - inserted.length,
    };
  }
}
