process.env.LOG_LEVEL = 'silent'; // keep test output clean; still real pino instances (see createLogger calls below)

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import RedisMock from 'ioredis-mock';
import Redis from 'ioredis';
import type EmbeddedPostgres from 'embedded-postgres';
import type { FastifyInstance } from 'fastify';
import { createDb, runMigrations, type Database } from '@tradosphere/database';
import { createLogger } from '@tradosphere/logger';
import { buildApp } from '../src/app';
import { DrizzleUserRepository, DrizzleSessionRepository } from '../src/repository';

// Task G (Sprint 5.5): full-stack integration tests -- the real Fastify app
// (buildApp(), not a hand-rolled subset) driven through app.inject(), backed
// by the *real* repository adapters from repository.ts, backed in turn by a
// *real* Postgres. Every prior HTTP-contract suite in this package
// (app.test.ts, rate-limit.test.ts) builds the app with
// InMemoryUserRepository/InMemorySessionRepository from fakes.ts -- correct
// for testing HTTP contract and business-logic wiring in isolation, but it
// means the seam between app.ts and the real Drizzle adapters was, before
// this file, only exercised indirectly: repository.integration.test.ts
// proves the adapters work against real Postgres in isolation; this file
// proves the whole stack still behaves correctly when they're wired into
// the real app and hit over real HTTP semantics (including concurrent
// requests -- see the race test in Suite A).
//
// Two suites, split by what they need real:
//   Suite A -- real Postgres, ioredis-mock. Runs for real in this sandbox.
//     ioredis-mock stands in only for the rate limiter's Redis dependency,
//     the same accepted substitution app.test.ts already uses -- rate
//     limiting has its own dedicated real+mock coverage in
//     rate-limit.test.ts, so it's not what this suite is verifying.
//   Suite B -- real Postgres AND real Redis, nothing mocked anywhere.
//     Self-skips in this sandbox (no Docker, no redis-server binary --same
//     constraint documented in rate-limit.test.ts) but is written EXACTLY
//     as it must run for real, mirroring that file's tryConnectRealRedis()
//     pattern, so it executes with no modification the moment a real Redis
//     is reachable (Docker Desktop locally, or Task H's CI service
//     container).
//
// Postgres bootstrap below is deliberately the same embedded-postgres
// mechanism repository.integration.test.ts already validated as feasible in
// this sandbox, on a distinct port (that file's comment documents why a
// shared port across files is avoided).
const TEST_PORT = 55434;
const JWT_SECRET = 'test-secret-not-for-prod';

let embeddedPg: EmbeddedPostgres | undefined;
let pool: Pool | undefined;
let db: Database | undefined;
let dataDir: string | undefined;
let postgresAvailable = false;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'tradosphere-auth-fullstack-pg-'));

  try {
    // See repository.integration.test.ts's beforeAll for why this is a
    // dynamic import: embedded-postgres is ESM-only and this package isn't.
    const { default: EmbeddedPostgresCtor } = await import('embedded-postgres');

    embeddedPg = new EmbeddedPostgresCtor({
      databaseDir: dataDir,
      user: 'tradosphere_test',
      password: 'test-password-not-for-prod',
      port: TEST_PORT,
      persistent: false,
      onLog: () => {},
    });
    await embeddedPg.initialise();
    await embeddedPg.start();
    await embeddedPg.createDatabase('tradosphere_auth_fullstack_test');

    pool = new Pool({
      host: 'localhost',
      port: TEST_PORT,
      user: 'tradosphere_test',
      password: 'test-password-not-for-prod',
      database: 'tradosphere_auth_fullstack_test',
    });
    pool.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('unexpected postgres pool error in fullstack.integration.test', err);
    });

    await runMigrations(pool);
    db = createDb(pool);
    postgresAvailable = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      'embedded-postgres unavailable in this environment; fullstack.integration suite will skip',
      err,
    );
    postgresAvailable = false;
  }
}, 30_000);

afterAll(async () => {
  await pool?.end();
  await embeddedPg?.stop();
  if (dataDir) {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

beforeEach(async () => {
  if (!postgresAvailable || !pool) return;
  await pool.query('TRUNCATE TABLE sessions, users RESTART IDENTITY CASCADE');
});

describe('full-stack HTTP surface (real Postgres, ioredis-mock rate limiter)', () => {
  let app: FastifyInstance | undefined;

  beforeEach(async () => {
    if (!postgresAvailable || !db) return;
    app = await buildApp({
      userRepo: new DrizzleUserRepository(db),
      sessionRepo: new DrizzleSessionRepository(db),
      jwtSecret: JWT_SECRET,
      logger: createLogger('auth-service-test'),
      // High enough that the lifecycle test's handful of requests can never
      // spuriously trip a 429 -- rate-limit behavior itself is this file's
      // Suite B's job (and rate-limit.test.ts's), not this suite's.
      redis: new RedisMock(),
      rateLimit: { max: 10_000, timeWindowMs: 60_000 },
    });
  });

  it('signup -> login -> me -> refresh -> logout all succeed against real Postgres through the real HTTP layer', async (ctx) => {
    if (!postgresAvailable || !app) {
      ctx.skip();
      return;
    }

    const signupRes = await app.inject({
      method: 'POST',
      url: '/signup',
      payload: { email: 'fullstack@tradosphere.os', password: 'correct-password' },
    });
    expect(signupRes.statusCode).toBe(201);
    const signup = signupRes.json();
    expect(signup.user.email).toBe('fullstack@tradosphere.os');

    const loginRes = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'fullstack@tradosphere.os', password: 'correct-password' },
    });
    expect(loginRes.statusCode).toBe(200);

    const meRes = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${signup.accessToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().email).toBe('fullstack@tradosphere.os');

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: signup.refreshToken },
    });
    expect(refreshRes.statusCode).toBe(200);
    const refreshed = refreshRes.json();
    expect(refreshed.refreshToken).not.toBe(signup.refreshToken);

    // The pre-refresh token was rotated out against a real `sessions` row,
    // not an in-memory Map -- a second /refresh with it must now fail.
    const reuseRes = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: signup.refreshToken },
    });
    expect(reuseRes.statusCode).toBe(401);

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/logout',
      payload: { refreshToken: refreshed.refreshToken },
    });
    expect(logoutRes.statusCode).toBe(204);

    const postLogoutRefresh = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: refreshed.refreshToken },
    });
    expect(postLogoutRefresh.statusCode).toBe(401);
  });

  it('signup rejects a duplicate email with 409 (sequential, real unique constraint via the pre-check)', async (ctx) => {
    if (!postgresAvailable || !app) {
      ctx.skip();
      return;
    }

    const payload = { email: 'dup@tradosphere.os', password: 'correct-password' };
    const first = await app.inject({ method: 'POST', url: '/signup', payload });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({ method: 'POST', url: '/signup', payload });
    expect(second.statusCode).toBe(409);
  });

  it('two concurrent signups for the same email never both succeed, and the loser gets 409, not 500', async (ctx) => {
    if (!postgresAvailable || !app) {
      ctx.skip();
      return;
    }

    // Task G finding, fixed in repository.ts's DrizzleUserRepository.create():
    // signup()'s findByEmail-then-create pre-check (auth-logic.ts) is not
    // atomic. Promise.all fires both requests before either awaits its
    // first DB round trip, so both pass the pre-check and both attempt the
    // insert -- the real users_email_unique index allows exactly one of
    // them to win. Before the Task G fix, the loser's raw Postgres 23505
    // error had no EmailInUseError-shaped handling in repository.ts, so it
    // fell through app.ts's `catch (err) { if (err instanceof
    // EmailInUseError) ...; throw err; }` and became a generic 500 from
    // setErrorHandler -- verified empirically by temporarily reverting the
    // fix in repository.ts and re-running this exact test, which failed
    // with statusCodes [201, 500] instead of the [201, 409] asserted below
    // (see EXECUTION_BOOK.md's Task G entry for that before/after run).
    // InMemoryUserRepository (every other suite's repo) never had a
    // uniqueness check to race against in the first place, which is why
    // nothing before this file could have caught it.
    const payload = { email: 'race@tradosphere.os', password: 'correct-password' };
    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: '/signup', payload }),
      app.inject({ method: 'POST', url: '/signup', payload }),
    ]);

    const statusCodes = [first.statusCode, second.statusCode].sort((a, b) => a - b);
    expect(statusCodes).toEqual([201, 409]);

    // Real constraint did its job -- exactly one row exists, not zero, not two.
    const count = await pool!.query('SELECT count(*)::int AS count FROM users WHERE email = $1', [payload.email]);
    expect(count.rows[0].count).toBe(1);
  });
});

describe('full-stack HTTP surface (real Postgres + real Redis, nothing mocked)', () => {
  // Sprint 5.5 binding infrastructure policy, same constraint documented in
  // rate-limit.test.ts: this sandbox has no Docker, no root, and no package
  // that bundles a real redis-server binary, so a real Redis cannot be
  // started here. Suite A above already proves the real-Postgres side of
  // this stack end to end; what remains unverified in this sandbox is the
  // *combination* of real Postgres and real Redis behind one Fastify
  // instance with nothing mocked. Connection-attempt logic below is
  // deliberately a copy of rate-limit.test.ts's tryConnectRealRedis()
  // rather than a shared import, matching this package's existing
  // convention of keeping each test file independently readable.
  const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

  async function tryConnectRealRedis(): Promise<Redis | undefined> {
    const client = new Redis(REDIS_URL, {
      lazyConnect: true,
      retryStrategy: () => null,
      maxRetriesPerRequest: 1,
      connectTimeout: 500,
    });
    client.on('error', () => {});

    try {
      await client.connect();
      await client.ping();
      return client;
    } catch {
      client.disconnect();
      return undefined;
    }
  }

  it('signup succeeds against real Postgres, then real Redis throttles the caller past the limit', async (ctx) => {
    if (!postgresAvailable || !db) {
      ctx.skip();
      return;
    }
    const client = await tryConnectRealRedis();
    if (!client) {
      ctx.skip();
      return;
    }

    try {
      await client.flushdb();

      const app = await buildApp({
        userRepo: new DrizzleUserRepository(db),
        sessionRepo: new DrizzleSessionRepository(db),
        jwtSecret: JWT_SECRET,
        logger: createLogger('auth-service-test'),
        redis: client,
        rateLimit: { max: 2, timeWindowMs: 60_000 },
      });

      // Request 1 of 2 allowed.
      const signupRes = await app.inject({
        method: 'POST',
        url: '/signup',
        payload: { email: 'fullstack-redis@tradosphere.os', password: 'correct-password' },
      });
      expect(signupRes.statusCode).toBe(201);

      // Request 2 of 2 allowed -- same real Postgres-backed user, real Redis counter.
      const loginRes = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'fullstack-redis@tradosphere.os', password: 'correct-password' },
      });
      expect(loginRes.statusCode).toBe(200);

      // Request 3: over max -- real Redis-backed limiter must throttle it,
      // and app.ts's error handler must surface that as 429, not 500.
      const throttledRes = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'fullstack-redis@tradosphere.os', password: 'correct-password' },
      });
      expect(throttledRes.statusCode).toBe(429);
    } finally {
      await client.flushdb();
      client.disconnect();
    }
  });
});
