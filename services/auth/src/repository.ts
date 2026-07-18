import { eq } from 'drizzle-orm';
import { users, sessions, type Database } from '@tradosphere/database';
import type { Role } from '@tradosphere/auth';
import { EmailInUseError } from './errors';

// Port (interface) the business logic in auth-logic.ts depends on -- never
// the other way around. This is what lets tests substitute an in-memory
// fake instead of routing through pg-mem, which cannot execute drizzle's
// `.returning()` (see packages/database/test/db.test.ts for the documented
// pg-mem/drizzle rowMode incompatibility this sidesteps).
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | undefined>;
  findById(id: string): Promise<UserRecord | undefined>;
  create(input: { email: string; passwordHash: string }): Promise<UserRecord>;
}

export interface SessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface SessionRepository {
  create(input: { userId: string; refreshTokenHash: string; expiresAt: Date }): Promise<void>;
  // Sprint 5.5 (Task A): the /refresh and /logout lookup path. Hashing is
  // the caller's job (via @tradosphere/auth's hashRefreshToken) -- this is
  // a plain indexed equality lookup, not a verify-by-scan.
  findByRefreshTokenHash(refreshTokenHash: string): Promise<SessionRecord | undefined>;
  // Sets revokedAt so the session is permanently unusable from that point
  // on, independent of its natural expiresAt. Used both by logout() and by
  // refresh()'s rotation (the old token is revoked the moment its
  // replacement is issued).
  revoke(id: string): Promise<void>;
}

// Real implementations, backed by drizzle against a live Postgres Pool.
// Not exercised by this package's test suite for the reason noted above --
// structural/type correctness is verified by `tsc`, and live behavior
// against a real Postgres instance is a Sprint 3+ integration test, matching
// the precedent set in packages/database.
export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row;
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
  }

  async create(input: { email: string; passwordHash: string }): Promise<UserRecord> {
    try {
      const [row] = await this.db
        .insert(users)
        .values({ email: input.email, passwordHash: input.passwordHash })
        .returning();
      return row;
    } catch (err) {
      // Task G (Sprint 5.5): signup()'s pre-check (`findByEmail` then throw
      // `EmailInUseError` if found -- see auth-logic.ts) is not atomic with
      // this insert. Two concurrent signups for the same email can both
      // pass the pre-check before either has written a row: the loser of
      // the resulting race lands here, not there. Found via a real-Postgres
      // full-stack test (services/auth/test/fullstack.integration.test.ts)
      // that fires two `/signup` calls for the same email with
      // `Promise.all` -- something no test before Task G could ever catch,
      // because InMemoryUserRepository's `create()` (used by every prior
      // suite) had no uniqueness check of its own to race against. Before
      // this fix, the loser's raw Postgres `23505` error had no
      // `EmailInUseError`-shaped handling anywhere, so it fell through
      // app.ts's `catch (err) { if (err instanceof EmailInUseError) ...;
      // throw err; }` and out to the generic 500 in `setErrorHandler` --
      // a real user-facing bug, not just a test gap. Catching the DB's own
      // unique-constraint violation and re-throwing it as the same
      // `EmailInUseError` the pre-check already uses means both the
      // sequential and racing paths converge on the one 409 contract
      // app.ts already implements; no caller above this needs to change.
      if (isUniqueViolation(err, 'users_email_unique')) {
        throw new EmailInUseError(input.email);
      }
      throw err;
    }
  }
}

// Postgres error code 23505 = unique_violation (see
// https://www.postgresql.org/docs/current/errcodes-appendix.html). node-postgres
// attaches `code` and `constraint` to the thrown error but doesn't export a
// typed error class for it, so this is a narrow duck-typed check rather than
// an `instanceof` -- scoped to one named constraint (not "any 23505") so a
// future, unrelated unique constraint on this table can't be silently
// mis-mapped to `EmailInUseError`.
function isUniqueViolation(err: unknown, constraint: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505' &&
    'constraint' in err &&
    (err as { constraint?: unknown }).constraint === constraint
  );
}

export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  async create(input: { userId: string; refreshTokenHash: string; expiresAt: Date }): Promise<void> {
    await this.db.insert(sessions).values({
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
    });
  }

  async findByRefreshTokenHash(refreshTokenHash: string): Promise<SessionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, refreshTokenHash))
      .limit(1);
    return row;
  }

  async revoke(id: string): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, id));
  }
}
