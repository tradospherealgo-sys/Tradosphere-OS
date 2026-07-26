import { desc, eq } from 'drizzle-orm';
import { companyFundamentals, type CompanyFundamentalsRow, type Database } from '@tradosphere/database';
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
  // Sprint 9 task 9.2 prerequisite: the gateway's fundamentals route needs a
  // read path, which never existed before now -- this service has only ever
  // been written to by the ingestion job. Returns the most recently ingested
  // reporting period for the symbol (by ingestedAt, not by reportingPeriod
  // string sort, since periods aren't guaranteed to sort chronologically as
  // text -- e.g. 'FY2026Q2' ingested before a late-arriving 'FY2025Q4' backfill).
  getLatestBySymbol(symbol: string): Promise<CompanyFundamentalsRow | undefined>;
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

  async getLatestBySymbol(symbol: string): Promise<CompanyFundamentalsRow | undefined> {
    const [row] = await this.db
      .select()
      .from(companyFundamentals)
      .where(eq(companyFundamentals.symbol, symbol))
      .orderBy(desc(companyFundamentals.ingestedAt))
      .limit(1);

    return row;
  }
}
