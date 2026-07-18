import { pgTable, uuid, text, integer, doublePrecision, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// Schema for Sprint 3 -- Market Data. Kept in its own file per the
// convention set in schema.ts ("everything else gets its own schema file in
// its own sprint").
//
// The unique index on (symbol, tick_timestamp) is what makes historical
// import idempotent: re-running an import for a range you've already
// ingested triggers `ON CONFLICT (symbol, tick_timestamp) DO NOTHING`
// instead of inserting duplicate rows (see services/market-data task 3.5).
export const marketTicks = pgTable(
  'market_ticks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    symbol: text('symbol').notNull(),
    price: doublePrecision('price').notNull(),
    volume: integer('volume').notNull(),
    tickTimestamp: timestamp('tick_timestamp', { withTimezone: true }).notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    symbolTickUnique: uniqueIndex('market_ticks_symbol_tick_unique').on(table.symbol, table.tickTimestamp),
  }),
);

export type MarketTickRow = typeof marketTicks.$inferSelect;
export type NewMarketTickRow = typeof marketTicks.$inferInsert;
