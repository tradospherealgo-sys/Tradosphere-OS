import { pgTable, uuid, text, doublePrecision, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// Schema for Sprint 4 task 4.3 -- Fundamental analysis data feed. Kept in its
// own file per the market-data-schema.ts convention ("everything else gets
// its own schema file in its own sprint").
//
// The unique index on (symbol, reporting_period) is what makes financials
// ingestion idempotent: re-ingesting the same company's same reporting
// period is `ON CONFLICT ... DO NOTHING` rather than a duplicate row -- same
// idempotency pattern as market_ticks in Sprint 3.
export const companyFundamentals = pgTable(
  'company_fundamentals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    symbol: text('symbol').notNull(),
    reportingPeriod: text('reporting_period').notNull(), // e.g. 'FY2026Q1'
    peRatio: doublePrecision('pe_ratio').notNull(),
    debtToEquity: doublePrecision('debt_to_equity').notNull(),
    revenueGrowthYoyPct: doublePrecision('revenue_growth_yoy_pct').notNull(),
    netProfitMarginPct: doublePrecision('net_profit_margin_pct').notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    symbolPeriodUnique: uniqueIndex('company_fundamentals_symbol_period_unique').on(table.symbol, table.reportingPeriod),
  }),
);

export type CompanyFundamentalsRow = typeof companyFundamentals.$inferSelect;
export type NewCompanyFundamentalsRow = typeof companyFundamentals.$inferInsert;
