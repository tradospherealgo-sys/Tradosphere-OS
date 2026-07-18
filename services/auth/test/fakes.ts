import { randomUUID } from 'node:crypto';
import type { UserRepository, SessionRepository, UserRecord, SessionRecord } from '../src/repository';
import { EmailInUseError } from '../src/errors';

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
    // Task G (Sprint 5.5): mirrors DrizzleUserRepository.create()'s
    // real-Postgres unique-constraint check (repository.ts) now that the
    // real adapter enforces one. Before this, the fake silently allowed a
    // second create() for an already-used email to overwrite the first
    // map entry -- the real schema (users_email_unique) has never allowed
    // that, so the fake and the real adapter disagreed on the same port
    // method's contract. Kept here as a plain duplicate check (not a
    // simulated DB error code) since that's the fake's whole job: enforce
    // the *contract*, not replicate Postgres's wire-level error shape --
    // the real error-code mapping is repository.ts's concern, verified
    // against a real Postgres in repository.integration.test.ts and
    // fullstack.integration.test.ts.
    if (this.byEmail.has(input.email)) {
      throw new EmailInUseError(input.email);
    }
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
  private byId = new Map<string, SessionRecord>();
  private byHash = new Map<string, SessionRecord>();

  // Test-only append-only log of every session ever created, in order --
  // several tests assert against this directly (e.g. "exactly one session
  // was created"). Rotation/revocation still just marks `revokedAt` on the
  // same record (matching the real repo's semantics), so entries here stay
  // live objects, not snapshots.
  public created: SessionRecord[] = [];

  async create(input: { userId: string; refreshTokenHash: string; expiresAt: Date }): Promise<void> {
    const session: SessionRecord = {
      id: randomUUID(),
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
      createdAt: new Date(),
      revokedAt: null,
    };
    this.byId.set(session.id, session);
    this.byHash.set(session.refreshTokenHash, session);
    this.created.push(session);
  }

  async findByRefreshTokenHash(refreshTokenHash: string): Promise<SessionRecord | undefined> {
    return this.byHash.get(refreshTokenHash);
  }

  async revoke(id: string): Promise<void> {
    const session = this.byId.get(id);
    if (session) {
      session.revokedAt = new Date();
    }
  }
}
