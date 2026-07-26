import { pgTable, uuid, text, doublePrecision, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './schema';

// Schema for Sprint 8 -- Trading, task 8.3 (Portfolio Engine). Kept in its
// own file per the convention set in schema.ts ("everything else gets its
// own schema file in its own sprint").
//
// Decision D17: services/portfolio's positions, cash balance, and P&L are
// all *computed on demand* from journal_entries (via the local
// TradeRecordSource port) and live market_ticks (via the local PriceSource
// port) -- neither needs its own table, the same "compute and return, don't
// persist the input" precedent D14/D16 already established for Fill and
// CioVerdict. The one thing that genuinely needs persistence is a
// point-in-time *snapshot* of the result, because "Equity Curve" and
// "Portfolio History" both require real time-series data that a purely
// computed-on-read value can never provide (there is nothing to look back
// at once the underlying prices have moved on). portfolio_snapshots is
// therefore this sprint's only new table: one row per MTM run, written by
// `POST /portfolio/snapshot` ("Daily MTM"), read back by
// `GET /portfolio/history` (serves both the equity curve and history
// deliverables from one mechanism, not two near-duplicate ones).
//
// asOf is the conceptual point in time the snapshot represents (caller-
// supplied, e.g. market close); createdAt is when the row was actually
// written -- same ingested-vs-event-time separation already established for
// market_ticks (services/paper-trading/src/price-source.ts) and for
// filledAt/priceAsOf in journal-schema.ts.
//
// totalEquity is stored, not left purely derivable, so a historical row
// remains meaningful even if the formula that produced it is later refined.
// It is defined to satisfy: totalEquity = startingCash + realizedPnl +
// unrealizedPnl, which Decision D17 proves algebraically equals
// cashBalance + positionsValue (the signed aggregate market value of every
// open position) -- the exact reconciliation task 8.3's own exit criterion
// asks for ("P&L reconciles against journal entries for seeded test
// trades").
//
// userId is nullable with onDelete 'set null': a portfolio snapshot is a
// historical record of account state, not user-owned content -- it outlives
// deletion of the account, the same reasoning journal-schema.ts already
// applies to journal_entries.user_id.

export const portfolioSnapshots = pgTable(
  'portfolio_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

    // -- Cash ledger, per Decision D17's formula --
    cashBalance: doublePrecision('cash_balance').notNull(),

    // -- Signed aggregate market value of open positions: Σ direction_i *
    // currentPrice_i * quantity_i. Positive for net-long exposure, negative
    // for net-short -- cashBalance + positionsValue === totalEquity. --
    positionsValue: doublePrecision('positions_value').notNull(),

    // -- P&L breakdown at snapshot time --
    realizedPnl: doublePrecision('realized_pnl').notNull(),
    unrealizedPnl: doublePrecision('unrealized_pnl').notNull(),

    // -- totalEquity = startingCash + realizedPnl + unrealizedPnl
    //             === cashBalance + positionsValue (Decision D17) --
    totalEquity: doublePrecision('total_equity').notNull(),

    // Free-form label for what triggered this snapshot (e.g. 'daily-mtm',
    // 'manual') -- never interpreted by code, purely for human/audit
    // readability in portfolio history views.
    label: text('label'),

    // The point in time this snapshot represents (caller-supplied).
    asOf: timestamp('as_of', { withTimezone: true }).notNull(),

    // When this row was actually written (server-assigned, never trusted
    // from the caller).
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('portfolio_snapshots_user_idx').on(table.userId),
    userAsOfIdx: index('portfolio_snapshots_user_as_of_idx').on(table.userId, table.asOf),
  }),
);

export type PortfolioSnapshotRow = typeof portfolioSnapshots.$inferSelect;
export type NewPortfolioSnapshotRow = typeof portfolioSnapshots.$inferInsert;
