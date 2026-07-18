import { companyFundamentals, type Database } from '@tradosphere/database';
import type { CompanyFinancials } from './fundamentals-ingest';

export interface InsertResult {
  requested: number;
  inserted: number;
  skipped: number;
}

// Port every consumer (ingestion job, future backfills) depends on.
// `DrizzleFundamentalsRepository` is the real implementation; tests use an
// in-memory double -- same pattern as services/market-data's
// MarketDataRepository (Sprint 3) and services/auth's UserRepository (Sprint 2).
export interface FundamentalsRepository {
  insertFinancials(records: CompanyFinancials[]): Promise<InsertResult>;
}

export class DrizzleFundamentalsRepository implements FundamentalsRepository {
  constructor(private readonly db: Database) {}

  async insertFinancials(records: CompanyFinancials[]): Promise<InsertResult> {
    if (records.length === 0) {
      return { requested: 0, inserted: 0, skipped: 0 };
    }

    // ON CONFLICT (symbol, reporting_period) DO NOTHING makes re-ingesting the
    // same company/period a silent no-op instead of a duplicate row --
    // identical idempotency approach to market_ticks (Sprint 3 task 3.5).
    const inserted = await this.db
      .insert(companyFundamentals)
      .values(
        records.map((r) => ({
          symbol: r.symbol,
          reportingPeriod: r.reportingPeriod,
          peRatio: r.peRatio,
          debtToEquity: r.debtToEquity,
          revenueGrowthYoyPct: r.revenueGrowthYoyPct,
          netProfitMarginPct: r.netProfitMarginPct,
        })),
      )
      .onConflictDoNothing({ target: [companyFundamentals.symbol, companyFundamentals.reportingPeriod] })
      .returning({ id: companyFundamentals.id });

    return {
      requested: records.length,
      inserted: inserted.length,
      skipped: records.length - inserted.length,
    };
  }
}
