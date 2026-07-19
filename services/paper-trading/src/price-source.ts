import { desc, eq } from 'drizzle-orm';
import { marketTicks, type Database } from '@tradosphere/database';

export interface RealTimePrice {
  symbol: string;
  price: number;
  asOfIso: string;
}

// Port every consumer of "what's the real current price" depends on -- same
// reuse-a-port-not-a-service pattern as MarketDataRepository
// (services/market-data/src/repository.ts) and the Drizzle*Repository ports
// in services/education/src/repository.ts. The real implementation below
// reads the exact market_ticks table services/market-data writes into;
// test/fakes.ts's InMemoryPriceSource implements this interface without
// touching Postgres at all.
export interface PriceSource {
  getLatestPrice(symbol: string): Promise<RealTimePrice | undefined>;
}

// Real adapter. Deliberately dumb: the latest row for the symbol, ordered by
// the tick's own timestamp -- not `ingestedAt`, so a delayed-but-backfilled
// tick is still ranked by when the market actually printed it, not when our
// pipeline happened to receive it. Returns undefined (never a guess) when
// the symbol has no ticks at all.
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
