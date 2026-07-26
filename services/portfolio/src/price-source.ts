import { desc, eq } from 'drizzle-orm';
import { marketTicks, type Database } from '@tradosphere/database';

export interface RealTimePrice {
  symbol: string;
  price: number;
  asOfIso: string;
}

// Port every consumer of "what's the real current price" depends on -- same
// reuse-a-port-not-a-service pattern as services/paper-trading's own
// PriceSource (services/paper-trading/src/price-source.ts). Deliberately
// duplicated here, byte-for-byte identical in shape, rather than imported --
// services/portfolio has zero dependency on services/paper-trading, the same
// one-directional service-isolation precedent D9/D12 established and D17
// extends to Portfolio. Feeds Decision D17's positionsValue/unrealizedPnl/
// Daily-MTM calculations. test/fakes.ts's InMemoryPriceSource implements
// this interface without touching Postgres at all, so a future live-broker
// PriceSource can be swapped in later without touching any business logic
// that depends on this port.
export interface PriceSource {
  getLatestPrice(symbol: string): Promise<RealTimePrice | undefined>;
}

// Real adapter. Deliberately dumb: the latest row for the symbol, ordered by
// the tick's own timestamp -- not `ingestedAt`, so a delayed-but-backfilled
// tick is still ranked by when the market actually printed it, not when our
// pipeline happened to receive it. Returns undefined (never a guess) when
// the symbol has no ticks at all -- callers (mtm.ts, risk.ts) must treat a
// missing price as an honest gap, never a fabricated value (Delta charter
// rule 5).
export class DatabasePriceSource implements PriceSource {
  constructor(private readonly db: Database) {}

  async getLatestPrice(symbol: string): Promise<RealTimePrice | undefined> {
    const [row] = await this.db
      .select()
      .from(marketTicks)
      .where(eq(marketTicks.symbol, symbol))
      .orderBy(desc(marketTicks.tickTimestamp))
      .limit(1);

    if (!row) return undefined;

    return {
      symbol: row.symbol,
      price: row.price,
      asOfIso: row.tickTimestamp.toISOString(),
    };
  }
}
