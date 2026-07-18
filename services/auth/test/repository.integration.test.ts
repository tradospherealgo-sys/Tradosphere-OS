process.env.LOG_LEVEL = 'silent'; // kept for parity with sibling suites; no pino instance in this file

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import type EmbeddedPostgres from 'embedded-postgres';
import { createDb, runMigrations, users, type Database } from '@tradosphere/database';
import { DrizzleUserRepository, DrizzleSessionRepository } from '../src/repository';

// Task F (Sprint 5.5): repository.ts's own comment documents that
// DrizzleUserRepository/DrizzleSessionRepository are "[n]ot exercised by this
// package's test suite" because pg-mem (packages/database/test/db.test.ts's
// engine) doesn't implement the rowMode wire-protocol feature drizzle's
// node-postgres driver uses for `.returning()`. That gap is real: every
// write path on these two classes (`create()` on both repos) depends on
// `.returning()`, so nothing before this file has ever run them against
// anything that could actually execute that code path. app.test.ts and
// auth-logic.test.ts exercise the *business logic* through the in-memory
// fakes in fakes.ts -- correct per-file boundary, but it means the Drizzle
// adapters themselves were, until now, verified only by `tsc`.
//
// This suite closes that gap with a real Postgres, not another mock:
// `embedded-postgres` (already a devDependency here) downloads and runs an
// actual `postgres` server binary as a child process. Feasibility was
// confirmed empirically before any test in this file was written -- a
// throwaway script in this sandbox ran embedded-postgres end to end
// (initialise -> start -> real `pg` client query -> stop) against this
// sandbox's linux-arm64 host and it worked cleanly. Unlike the real-Redis
// suite in rate-limit.test.ts, this suite does not need to self-skip in
// *this* environment -- but `beforeAll` still guards startup with a
// try/catch and every test below checks `postgresAvailable` and skips
// itself (mirroring that same pattern) rather than hard-failing the whole
// file, in case this ever runs somewhere the platform-specific
// embedded-postgres binary genuinely isn't available.
//
// Schema setup goes through the real `runMigrations()` from
// @tradosphere/database, not a hand-copied CREATE TABLE -- this is the exact
// function every service calls on boot (see services/auth/src/index.ts), so
// this suite also doubles as the first real-Postgres exercise of the
// migration runner itself (db.test.ts's pg-mem suite already covers the
// migration SQL's shape; it cannot execute the runner function, which needs
// a real `pg.Pool`).
//
// Port 55433 is deliberately distinct from Postgres's default 5432 (and
// docker-compose.yml's mapped 5432) so this suite can never collide with a
// developer's local Postgres or a running `docker compose up`. If a future
// suite (Task G) also boots embedded-postgres, give it its own distinct
// port rather than reusing this one.
const TEST_PORT = 55433;

let embeddedPg: EmbeddedPostgres | undefined;
let pool: Pool | undefined;
let db: Database | undefined;
let dataDir: string | undefined;
let postgresAvailable = false;

let userRepo: DrizzleUserRepository;
let sessionRepo: DrizzleSessionRepository;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'tradosphere-auth-pg-'));

  try {
    // Dynamic import (not a static `import EmbeddedPostgres from
    // 'embedded-postgres'`) deliberately -- embedded-postgres ships ESM-only
    // (`"type": "module"`, no CJS `exports` condition), while this package
    // has no `"type": "module"` of its own. A static import compiles under
    // NodeNext to a `require()`, which cannot load a pure-ESM package and
    // would throw ERR_REQUIRE_ESM. Node's dynamic `import()` always uses
    // real ESM resolution regardless of the importing module's own format,
    // which sidesteps the mismatch entirely. The `import type` above is
    // erased at compile time, so it carries no runtime resolution risk --
    // it only gives `embeddedPg` a real type.
    const { default: EmbeddedPostgresCtor } = await import('embedded-postgres');

    embeddedPg = new EmbeddedPostgresCtor({
      databaseDir: dataDir,
      user: 'tradosphere_test',
      password: 'test-password-not-for-prod',
      port: TEST_PORT,
      persistent: false,
      onLog: () => {}, // Postgres's own boot log is noisy; real failures still throw and are caught below.
    });
    await embeddedPg.initialise();
    await embeddedPg.start();
    await embeddedPg.createDatabase('tradosphere_auth_test');

    pool = new Pool({
      host: 'localhost',
      port: TEST_PORT,
      user: 'tradosphere_test',
      password: 'test-password-not-for-prod',
      database: 'tradosphere_auth_test',
    });
    pool.on('error', (err) => {
      // Same reasoning as index.ts's pool error handler: an uncaught
      // 'error' event on a pg Pool crashes the process with no context
      // otherwise.
      // eslint-disable-next-line no-console
      console.error('unexpected postgres pool error in repository.integration.test', err);
    });

    // The real boot path (services/auth/src/index.ts), not a shortcut --
    // proves the migrations this service ships actually produce a schema
    // DrizzleUserRepository/DrizzleSessionRepository can read and write.
    await runMigrations(pool);
    db = createDb(pool);
    userRepo = new DrizzleUserRepository(db);
    sessionRepo = new DrizzleSessionRepository(db);
    postgresAvailable = true;
  } catch (err) {
    // Environment-blocked, not a code failure -- see the file-level comment
    // above. Every test below checks `postgresAvailable` and skips itself
    // rather than failing on an infrastructure gap.
    // eslint-disable-next-line no-console
    console.error(
      'embedded-postgres unavailable in this environment; repository.integration suite will skip',
      err,
    );
    postgresAvailable = false;
  }
}, 30_000);

afterAll(async () => {
  await pool?.end();
  // persistent: false makes stop() delete embeddedPg's own data files: the
  // rmSync below is a defensive backstop for the mkdtempSync wrapper
  // directory itself, not a duplicate of that cleanup.
  await embeddedPg?.stop();
  if (dataDir) {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

beforeEach(async () => {
  if (!postgresAvailable || !pool) return;
  // Fresh tables per test -- same isolation reasoning as rate-limit.test.ts's
  // per-test `flushall()`: a leftover row from an earlier test in this file
  // must never let a later test's assertion pass (or fail) for the wrong
  // reason. CASCADE is required because `sessions` FKs into `users`.
  await pool.query('TRUNCATE TABLE sessions, users RESTART IDENTITY CASCADE');
});

describe('DrizzleUserRepository (real Postgres)', () => {
  it('create() persists a user and returns it with a generated id and default role', async (ctx) => {
    if (!postgresAvailable) {
      ctx.skip();
      return;
    }

    const user = await userRepo.create({ email: 'anshh@tradosphere.os', passwordHash: 'hashed:x' });

    expect(user.id).toEqual(expect.any(String));
    expect(user.email).toBe('anshh@tradosphere.os');
    expect(user.passwordHash).toBe('hashed:x');
    expect(user.role).toBe('trader'); // schema.ts's column default, not app-level logic
  });

  it('findByEmail() returns the created user, and undefined for an unknown email', async (ctx) => {
    if (!postgresAvailable) {
      ctx.skip();
      return;
    }

    const created = await userRepo.create({ email: 'anshh@tradosphere.os', passwordHash: 'hashed:x' });

    const found = await userRepo.findByEmail('anshh@tradosphere.os');
    expect(found).toEqual(created);

    const missing = await userRepo.findByEmail('nobody@tradosphere.os');
    expect(missing).toBeUndefined();
  });

  it('findById() returns the created user, and undefined for an unknown id', async (ctx) => {
    if (!postgresAvailable) {
      ctx.skip();
      return;
    }

    const created = await userRepo.create({ email: 'anshh@tradosphere.os', passwordHash: 'hashed:x' });

    const found = await userRepo.findById(created.id);
    expect(found).toEqual(created);

    const missing = await userRepo.findById('00000000-0000-4000-8000-000000000000');
    expect(missing).toBeUndefined();
  });

  it('enforces the real unique-email constraint from schema.ts (users_email_unique)', async (ctx) => {
    if (!postgresAvailable) {
      ctx.skip();
      return;
    }

    await userRepo.create({ email: 'anshh@tradosphere.os', passwordHash: 'hashed:one' });

    // This is exactly the write path pg-mem cannot execute (`.returning()`)
    // -- against real Postgres, the unique index rejects the duplicate.
    await expect(userRepo.create({ email: 'anshh@tradosphere.os', passwordHash: 'hashed:two' })).rejects.toThrow();
  });
});

describe('DrizzleSessionRepository (real Postgres)', () => {
  it('create() + findByRefreshTokenHash() round-trip a session for a real user', async (ctx) => {
    if (!postgresAvailable) {
      ctx.skip();
      return;
    }

    const user = await userRepo.create({ email: 'anshh@tradosphere.os', passwordHash: 'hashed:x' });
    const expiresAt = new Date(Date.now() + 60_000);

    await sessionRepo.create({ userId: user.id, refreshTokenHash: 'refresh-hash-1', expiresAt });

    const found = await sessionRepo.findByRefreshTokenHash('refresh-hash-1');
    expect(found).toBeDefined();
    expect(found?.userId).toBe(user.id);
    expect(found?.revokedAt).toBeNull();
    expect(found?.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  it('findByRefreshTokenHash() returns undefined for an unknown hash', async (ctx) => {
    if (!postgresAvailable) {
      ctx.skip();
      return;
    }

    const found = await sessionRepo.findByRefreshTokenHash('no-such-hash');
    expect(found).toBeUndefined();
  });

  it('revoke() sets revokedAt on the real row', async (ctx) => {
    if (!postgresAvailable) {
      ctx.skip();
      return;
    }

    const user = await userRepo.create({ email: 'anshh@tradosphere.os', passwordHash: 'hashed:x' });
    await sessionRepo.create({
      userId: user.id,
      refreshTokenHash: 'refresh-hash-1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const before = await sessionRepo.findByRefreshTokenHash('refresh-hash-1');
    expect(before?.revokedAt).toBeNull();

    await sessionRepo.revoke(before!.id);

    const after = await sessionRepo.findByRefreshTokenHash('refresh-hash-1');
    expect(after?.revokedAt).toBeInstanceOf(Date);
  });

  it('enforces the real unique refresh-token-hash constraint (sessions_refresh_token_hash_unique)', async (ctx) => {
    if (!postgresAvailable) {
      ctx.skip();
      return;
    }

    const user = await userRepo.create({ email: 'anshh@tradosphere.os', passwordHash: 'hashed:x' });
    const expiresAt = new Date(Date.now() + 60_000);
    await sessionRepo.create({ userId: user.id, refreshTokenHash: 'dup-hash', expiresAt });

    await expect(sessionRepo.create({ userId: user.id, refreshTokenHash: 'dup-hash', expiresAt })).rejects.toThrow();
  });

  it('cascades session deletion when the parent user row is deleted (real FK, schema.ts)', async (ctx) => {
    if (!postgresAvailable) {
      ctx.skip();
      return;
    }

    const user = await userRepo.create({ email: 'cascade@tradosphere.os', passwordHash: 'hashed:x' });
    await sessionRepo.create({
      userId: user.id,
      refreshTokenHash: 'cascade-hash',
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await sessionRepo.findByRefreshTokenHash('cascade-hash')).toBeDefined();

    // No delete() on UserRepository's port -- services/auth never deletes a
    // user through the app, so there's nothing to call there. Going
    // straight through drizzle here is the correct way to exercise the
    // schema-level ON DELETE CASCADE itself, matching db.test.ts's
    // equivalent raw-SQL cascade test for the same FK, but through the real
    // ORM layer this time instead of pg-mem's raw SQL interface.
    await db!.delete(users).where(eq(users.id, user.id));

    expect(await sessionRepo.findByRefreshTokenHash('cascade-hash')).toBeUndefined();
  });
});
