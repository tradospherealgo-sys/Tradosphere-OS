import { eq } from 'drizzle-orm';
import { users, sessions, type Database } from '@tradosphere/database';
import type { Role } from '@tradosphere/auth';

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

export interface SessionRepository {
  create(input: { userId: string; refreshTokenHash: string; expiresAt: Date }): Promise<void>;
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
    const [row] = await this.db
      .insert(users)
      .values({ email: input.email, passwordHash: input.passwordHash })
      .returning();
    return row;
  }
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
}
