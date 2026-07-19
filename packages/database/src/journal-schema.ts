import { pgTable, uuid, text, doublePrecision, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { users } from './schema';

// Schema for Sprint 8 -- Trading, task 8.2 (Journal). Kept in its own file
// per the convention set in schema.ts ("everything else gets its own schema
// file in its own sprint").
//
// Decision D16: neither TradeIdea nor CioVerdict (packages/shared-types,
// Sprint 6) nor Fill (Sprint 8 task 8.1) is ever persisted anywhere
// upstream of this table -- services/cio computes a verdict fresh on every
// call and returns it; services/paper-trading computes a fill and returns
// it. Nothing upstream carries an id a journal row could foreign-key
// against. journal_entries is therefore the FIRST point of persistence for
// a paper trade: one row snapshots the real Fill that executed it plus the
// TradeIdea/CioVerdict recommendation it was based on, exactly as generated
// at that moment -- never re-derived later. Every `recommended_*`/`cio_*`
// column is nullable: a paper trade placed with no CIO recommendation
// behind it is an honest, reportable gap, never a fabricated value (Delta
// charter rule 5). Outcome columns (status/exit_price/exit_at/
// realized_pnl) start empty and are written exactly once, by
// services/journal's `recordOutcome()`, which refuses to silently
// overwrite an already-closed entry.
//
// services/journal has zero dependency on services/paper-trading (or vice
// versa) -- a caller passes in the Fill placeOrder() already returned,
// rather than services/journal calling into paper-trading itself, keeping
// the D9/D12 service-isolation precedent intact.

export const orderSideEnum = pgEnum('order_side', ['buy', 'sell']);
export const tradeDirectionEnum = pgEnum('trade_direction', ['long', 'short']);
export const cioVerdictLabelEnum = pgEnum('cio_verdict_label', [
  'bullish',
  'moderately_bullish',
  'neutral',
  'moderately_bearish',
  'bearish',
]);
export const journalEntryStatusEnum = pgEnum('journal_entry_status', ['open', 'closed']);

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Who placed the trade. Nullable, onDelete 'set null': a journal entry
    // is a historical trading record, not user-owned content -- it outlives
    // deletion of the placing user's account, same reasoning
    // education-schema.ts already applies to created_by/category_id.
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

    // -- The real fill (Sprint 8 task 8.1's Fill) --
    symbol: text('symbol').notNull(),
    side: orderSideEnum('side').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    fillPrice: doublePrecision('fill_price').notNull(),
    filledAt: timestamp('filled_at', { withTimezone: true }).notNull(),
    // Decision D14's freshness field, carried into the journal so a closed
    // trade's record can always show how fresh its reference price was.
    priceAsOf: timestamp('price_as_of', { withTimezone: true }).notNull(),

    // -- The CIO recommendation snapshot this trade was based on
    // (TradeIdea + its parent CioVerdict), exactly as generated. Nullable
    // throughout: absent for a trade placed with no CIO idea behind it. --
    recommendedDirection: tradeDirectionEnum('recommended_direction'),
    recommendedEntry: doublePrecision('recommended_entry'),
    recommendedStopLoss: doublePrecision('recommended_stop_loss'),
    recommendedTarget: doublePrecision('recommended_target'),
    recommendedRiskRewardRatio: doublePrecision('recommended_risk_reward_ratio'),
    cioVerdictLabel: cioVerdictLabelEnum('cio_verdict'),
    cioConfidence: doublePrecision('cio_confidence'),
    educationNote: text('education_note'),
    recommendationGeneratedAt: timestamp('recommendation_generated_at', { withTimezone: true }),

    // -- Actual outcome. Starts empty (status 'open'); written exactly once
    // by recordOutcome() when the position closes, never pre-filled. --
    status: journalEntryStatusEnum('status').notNull().default('open'),
    exitPrice: doublePrecision('exit_price'),
    exitAt: timestamp('exit_at', { withTimezone: true }),
    realizedPnl: doublePrecision('realized_pnl'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('journal_entries_user_idx').on(table.userId),
    symbolIdx: index('journal_entries_symbol_idx').on(table.symbol),
    statusIdx: index('journal_entries_status_idx').on(table.status),
  }),
);

export type JournalEntryRow = typeof journalEntries.$inferSelect;
export type NewJournalEntryRow = typeof journalEntries.$inferInsert;
