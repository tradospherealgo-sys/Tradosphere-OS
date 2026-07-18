import { randomUUID } from 'node:crypto';
import type { UserRepository, SessionRepository, UserRecord } from '../src/repository';

// In-memory test doubles for the repository ports. Used instead of
// pg-mem/drizzle here because drizzle's node-postgres driver relies on
// `.returning()` (rowMode: 'array'), which pg-mem's Pool shim does not
// implement (see packages/database/test/db.test.ts for the full writeup).
// Testing business logic against the port, not the adapter, is the correct
// boundary anyway -- DrizzleUserRepository/DrizzleSessionRepository are
// exercised for real starting with Sprint 3+ integration tests.
export class InMemoryUserRepository implements UserRepository {
  private byEmail = new Map<string, UserRecord>();
  private byId = new Map<string, UserRecord>();

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    return this.byEmail.get(email);
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    return this.byId.get(id);
  }

  async create(input: { email: string; passwordHash: string }): Promise<UserRecord> {
    const user: UserRecord = {
      id: randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      role: 'trader',
    };
    this.byEmail.set(user.email, user);
    this.byId.set(user.id, user);
    return user;
  }

  // Test-only helper to seed a user directly (e.g. a pre-made admin) without
  // going through signup, which always assigns the default 'trader' role.
  seed(user: UserRecord): void {
    this.byEmail.set(user.email, user);
    this.byId.set(user.id, user);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  public created: Array<{ userId: string; refreshTokenHash: string; expiresAt: Date }> = [];

  async create(input: { userId: string; refreshTokenHash: string; expiresAt: Date }): Promise<void> {
    this.created.push(input);
  }
}
