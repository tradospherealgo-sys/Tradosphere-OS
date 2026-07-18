import { describe, it, expect } from 'vitest';
import { InMemoryFundamentalsRepository } from './fakes';
import type { CompanyFinancials } from '../src/fundamentals-ingest';

// Exercises the FundamentalsRepository port via its in-memory test double --
// same "test against the port, not the adapter" approach used for
// MarketDataRepository (Sprint 3) and the auth repositories (Sprint 2).
describe('FundamentalsRepository (in-memory)', () => {
  const record: CompanyFinancials = {
    symbol: 'TCS',
    reportingPeriod: 'FY2026Q1',
    peRatio: 30.1,
    debtToEquity: 0.1,
    revenueGrowthYoyPct: 15.0,
    netProfitMarginPct: 20.0,
  };

  it('inserts new records and reports an accurate count', async () => {
    const repo = new InMemoryFundamentalsRepository();
    const result = await repo.insertFinancials([record]);
    expect(result).toEqual({ requested: 1, inserted: 1, skipped: 0 });
    expect(repo.stored.size).toBe(1);
  });

  it('is idempotent for the same (symbol, reportingPeriod) on re-ingestion', async () => {
    const repo = new InMemoryFundamentalsRepository();
    await repo.insertFinancials([record]);
    const second = await repo.insertFinancials([record]);
    expect(second).toEqual({ requested: 1, inserted: 0, skipped: 1 });
    expect(repo.stored.size).toBe(1);
  });
});
