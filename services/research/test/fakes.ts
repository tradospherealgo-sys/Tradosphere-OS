import type { CompanyFinancials } from '../src/fundamentals-ingest';
import type { FundamentalsRepository, InsertResult } from '../src/fundamentals-repository';

// Mirrors services/market-data/test/fakes.ts's InMemoryMarketDataRepository:
// same (symbol, period) idempotency semantics as the real
// DrizzleFundamentalsRepository, without touching Postgres.
export class InMemoryFundamentalsRepository implements FundamentalsRepository {
  public readonly stored = new Map<string, CompanyFinancials>();

  async insertFinancials(records: CompanyFinancials[]): Promise<InsertResult> {
    let inserted = 0;
    for (const record of records) {
      const key = `${record.symbol}:${record.reportingPeriod}`;
      if (this.stored.has(key)) continue;
      this.stored.set(key, record);
      inserted += 1;
    }
    return { requested: records.length, inserted, skipped: records.length - inserted };
  }
}
