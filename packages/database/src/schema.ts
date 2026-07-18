import { pgTable, uuid, text, timestamp, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';

// Core schema for Sprint 2 -- Infrastructure.
// Everything else (portfolio, journal, market data, etc.) gets its own schema
// file in its own sprint. Don't add unrelated tables here.

export const roleEnum = pgEnum('role', ['admin', 'trader', 'viewer']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull().default('trader'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_unique').on(table.email),
  }),
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Sprint 5.5 (Task A): nullable, set once at revoke time (logout, or
    // superseded by rotation on /refresh). Distinct from `expiresAt` --
    // a session can be revoked long before its natural expiry, and the two
    // are checked independently by `refresh()`/`logout()` in
    // services/auth/src/auth-logic.ts.
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    // /refresh's hot path is "find the session for this hash" -- without
    // this index that's a sequential scan over every session row ever
    // created, on every token refresh, forever.
    refreshTokenHashIdx: uniqueIndex('sessions_refresh_token_hash_unique').on(table.refreshTokenHash),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
