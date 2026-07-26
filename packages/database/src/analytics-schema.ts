import { pgTable, uuid, text, doublePrecision, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './schema';

// Schema for Sprint 8 -- Trading, task 8.4 (Analytics Engine). Kept in its
// own file per the convention set in schema.ts ("everything else gets its
// own schema file in its own sprint").
//
// Decision D18: almost every Analytics number (win rate, drawdown, Sharpe/
// Sortino, heatmaps, session/instrument/strategy breakdowns) is *computed on
// demand* from journal_entries (via the local JournalEntrySource port) and
// portfolio_snapshots (via the local EquitySnapshotSource port) -- neither
// needs its own table, the same "compute and return, don't persist the
// input" precedent D14/D16/D17 already established. The one thing that
// genuinely warrants persistence is a point-in-time *report*: a named,
// generated snapshot of the full stat set as of a given moment (or over a
// given period), so a user can generate a "January 2026" report once and
// look back at exactly what it said without recomputing it, the same
// "Equity Curve needs real history, not a purely computed-on-read value"
// reasoning D17 used for portfolio_snapshots. analytics_reports is
// therefore this task's only new table: one row per report generation, one
// row per GET /analytics/reports listing.
//
// Every stat column here is nullable except the raw counts and the realized
// P&L sum, which are legitimately always computable (a true zero over zero
// trades is a real number, not a gap). A ratio computed from zero trades
// (win rate, average return, expectancy, either R:R, drawdown, Sharpe,
// Sortino) is a genuine gap when there is no data behind it -- persisting a
// fabricated 0 in that case would silently misrepresent "no trades yet" as
// "traded and broke exactly even," so those columns stay NULL instead
// (Delta charter rule 5, applied here by Forge, same as journal-schema.ts's
// recommended_*/cio_* columns and portfolio's missingPriceSymbols gap).
//
// userId is nullable with onDelete 'set null': an analytics report is a
// historical record of what was reported, not user-owned content -- it
// outlives deletion of the account, the same reasoning journal_entries and
// portfolio_snapshots already establish.

export const analyticsReports = pgTable(
  'analytics_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

    // Free-form label (e.g. 'monthly-2026-01', 'manual') -- never
    // interpreted by code, purely for human/audit readability, same
    // precedent as portfolio_snapshots.label.
    label: text('label'),

    // The period this report covers. Both nullable: a report can cover
    // "all history to date" (both null), a bounded custom range (both set),
    // or an open-ended range (one set).
    fromDate: timestamp('from_date', { withTimezone: true }),
    toDate: timestamp('to_date', { withTimezone: true }),

    // -- Trade counts: always real, always computable, zero is a true zero --
    totalTrades: integer('total_trades').notNull(),
    winningTrades: integer('winning_trades').notNull(),
    losingTrades: integer('losing_trades').notNull(),
    breakevenTrades: integer('breakeven_trades').notNull(),
    openTrades: integer('open_trades').notNull(),

    // -- Realized P&L sum: always real, zero over zero trades is a true zero --
    totalRealizedPnl: doublePrecision('total_realized_pnl').notNull(),

    // -- Ratios/statistics: NULL when totalTrades (or the specific
    // denominator each one needs) is insufficient to compute honestly --
    winRate: doublePrecision('win_rate'),
    averageReturn: doublePrecision('average_return'),
    averageReturnPct: doublePrecision('average_return_pct'),
    expectancy: doublePrecision('expectancy'),
    plannedRiskRewardRatio: doublePrecision('planned_risk_reward_ratio'),
    realizedRiskRewardRatio: doublePrecision('realized_risk_reward_ratio'),
    maxDrawdownPct: doublePrecision('max_drawdown_pct'),

    // Sharpe/Sortino need >= 2 portfolio_snapshots rows to derive even one
    // period return -- NULL (not 0) when that data doesn't exist yet.
    sharpeRatio: doublePrecision('sharpe_ratio'),
    sortinoRatio: doublePrecision('sortino_ratio'),

    // The point in time this report represents (caller-supplied, defaults
    // to generation time) -- same ingested-vs-event-time separation as
    // portfolio_snapshots.asOf.
    asOf: timestamp('as_of', { withTimezone: true }).notNull(),

    // When this row was actually written (server-assigned, never trusted
    // from the caller).
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('analytics_reports_user_idx').on(table.userId),
    userAsOfIdx: index('analytics_reports_user_as_of_idx').on(table.userId, table.asOf),
  }),
);

export type AnalyticsReportRow = typeof analyticsReports.$inferSelect;
export type NewAnalyticsReportRow = typeof analyticsReports.$inferInsert;
