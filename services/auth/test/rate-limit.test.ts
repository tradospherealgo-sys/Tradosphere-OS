process.env.LOG_LEVEL = 'silent'; // keep test output clean; still a real pino instance

import { describe, it, expect } from 'vitest';
import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';
import { createLogger } from '@tradosphere/logger';
import { buildApp } from '../src/app';
import { InMemoryUserRepository, InMemorySessionRepository } from './fakes';

const JWT_SECRET = 'test-secret-not-for-prod';

// Task D (Sprint 5.5): coverage for the Redis-backed rate limiter registered
// in app.ts.
//
// Earlier in this task, an initial version of this suite treated
// ioredis-mock as fundamentally incompatible with @fastify/rate-limit's
// Lua-script-based RedisStore (redis.defineCommand), based on a full
// Fastify+plugin+mock spike where every request returned 200 and 429 never
// fired. That diagnosis was wrong. The actual root cause -- found and fixed
// in this same task -- was that app.ts called `app.register(rateLimit, {...})`
// without `await`. fastify.register() only *schedules* a plugin; it does
// not run the plugin body before the next synchronous line executes. The
// route declarations that followed were therefore compiled before
// @fastify/rate-limit's `onRoute` hook existed, so the limiter silently
// attached to zero routes -- for a real Redis client or a mock, it made no
// difference, because the preHandler was never wired in the first place.
// (This is a known footgun: see fastify/fastify-rate-limit#292.) Once
// app.ts awaits the registration, ioredis-mock enforces the limit
// correctly, as the suite below verifies for real.
//
// Awaiting the registration surfaced a second, independent bug immediately
// behind the first: @fastify/rate-limit's preHandler throws a plain Error
// with `.statusCode = 429` once a caller exceeds `max` (see
// defaultErrorResponse in the plugin's index.js), but app.ts's global
// setErrorHandler collapsed every error -- this one included -- into a flat
// 500. That was invisible for the same reason as the first bug: with the
// limiter never wired, its 429 error was never thrown in the first place,
// so the handler's mishandling of it had nothing to mishandle. Fixed in
// app.ts by having the error handler honor a 429 statusCode instead of
// overwriting it.

describe('rate-limit enforcement (ioredis-mock)', () => {
  // Genuine throttling assertions -- not just a "does it crash" smoke test.
  // ioredis-mock correctly emulates the RedisStore's Lua script (INCR +
  // PTTL + conditional PEXPIRE) once the plugin is registered correctly;
  // this suite proves the counting/threshold logic itself is correct.
  // What it does NOT prove is wire-protocol fidelity against a real
  // redis-server binary -- that is the real-Redis suite's job below.
  //
  // Each test below flushes its RedisMock instance before use. Confirmed
  // empirically (not assumed): ioredis-mock instances do not each get their
  // own isolated store -- `new RedisMock()` simulates connecting to one
  // shared in-memory "server" per process, the same way multiple real
  // ioredis clients pointed at one real Redis share its keyspace. Since
  // @fastify/rate-limit's default key generator is per-IP and every
  // app.inject() call here uses the same loopback IP under the same
  // hardcoded nameSpace ('tradosphere-auth-rl-' in app.ts), a fresh
  // `new RedisMock()` with no flush would silently inherit whatever count
  // an earlier test in this file already left behind on that same shared
  // key -- exactly the kind of cross-test leakage the real-Redis suite
  // below already guards against with its own `flushdb()` call.
  it('allows requests under the limit and returns 429 once max is exceeded within the window', async () => {
    const redis = new RedisMock();
    await redis.flushall();
    const app = await buildApp({
      userRepo: new InMemoryUserRepository(),
      sessionRepo: new InMemorySessionRepository(),
      jwtSecret: JWT_SECRET,
      logger: createLogger('auth-service-test'),
      redis,
      rateLimit: { max: 3, timeWindowMs: 60_000 },
    });

    const attempt = () =>
      app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'nobody@tradosphere.os', password: 'wrong-password' },
      });

    // Deliberately wrong credentials: rate limiting must fire based on
    // request count alone, regardless of the route's own outcome.
    const first = await attempt();
    const second = await attempt();
    const third = await attempt();
    const fourth = await attempt();

    expect(first.statusCode).toBe(401);
    expect(first.headers['x-ratelimit-remaining']).toBe('2');
    expect(second.statusCode).toBe(401);
    expect(second.headers['x-ratelimit-remaining']).toBe('1');
    expect(third.statusCode).toBe(401);
    expect(third.headers['x-ratelimit-remaining']).toBe('0');
    expect(fourth.statusCode).toBe(429);
  });

  it('still enforces normal auth responses (400/401) alongside the rate-limit preHandler', async () => {
    const redis = new RedisMock();
    await redis.flushall();
    const app = await buildApp({
      userRepo: new InMemoryUserRepository(),
      sessionRepo: new InMemorySessionRepository(),
      jwtSecret: JWT_SECRET,
      logger: createLogger('auth-service-test'),
      redis,
      rateLimit: { max: 10, timeWindowMs: 60_000 },
    });

    const badBody = await app.inject({ method: 'POST', url: '/signup', payload: {} });
    expect(badBody.statusCode).toBe(400);

    const badLogin = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'nobody@tradosphere.os', password: 'whatever' },
    });
    expect(badLogin.statusCode).toBe(401);
  });

  it('rate-limits independently of route outcome (counts a successful signup + a validation failure together)', async () => {
    const redis = new RedisMock();
    await redis.flushall();
    const app = await buildApp({
      userRepo: new InMemoryUserRepository(),
      sessionRepo: new InMemorySessionRepository(),
      jwtSecret: JWT_SECRET,
      logger: createLogger('auth-service-test'),
      redis,
      rateLimit: { max: 2, timeWindowMs: 60_000 },
    });

    // nameSpace + key generator default to per-IP, not per-route, so this
    // hits the same counter as a subsequent /login call from the same
    // injected client IP.
    const signupRes = await app.inject({
      method: 'POST',
      url: '/signup',
      payload: { email: 'anshh@tradosphere.os', password: 'correct-password' },
    });
    expect(signupRes.statusCode).toBe(201);

    const badLogin = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'nobody@tradosphere.os', password: 'whatever' },
    });
    expect(badLogin.statusCode).toBe(401);

    const throttled = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'nobody@tradosphere.os', password: 'whatever' },
    });
    expect(throttled.statusCode).toBe(429);
  });
});

describe('rate-limit enforcement (real Redis, protocol-level verification)', () => {
  // Sprint 5.5 binding infrastructure policy: this sandbox has no Docker,
  // no root, and no package that bundles a real redis-server binary, so a
  // real Redis cannot be started here. The suite above already proves the
  // limiter's counting/threshold logic is correct end to end; what remains
  // unverified in this sandbox is wire-protocol fidelity against an actual
  // redis-server binary (EVAL/EVALSHA, real INCR/PTTL/PEXPIRE semantics,
  // real TTL expiry timing). This suite is written EXACTLY as it must run
  // for real, and self-skips (via Vitest's runtime `ctx.skip()`) rather
  // than being faked or omitted. The moment this file runs somewhere
  // REDIS_URL resolves -- Docker Desktop locally, or the service container
  // added in Task H -- these assertions execute for real with no
  // modification required.
  const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

  async function tryConnectRealRedis(): Promise<Redis | undefined> {
    const client = new Redis(REDIS_URL, {
      lazyConnect: true,
      // Fail fast instead of ioredis's default indefinite-retry-with-backoff
      // strategy -- otherwise an absent Redis would hang this test rather
      // than cleanly skip it.
      retryStrategy: () => null,
      maxRetriesPerRequest: 1,
      connectTimeout: 500,
    });
    // A listener must exist before connecting or an unreachable Redis
    // crashes the process via an uncaught 'error' event -- same reasoning
    // as the pool/redis error handlers in index.ts. The connect() call
    // below is what actually surfaces the failure to this test.
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

  it('allows requests under the limit and returns 429 once max is exceeded within the window', async (ctx) => {
    const client = await tryConnectRealRedis();
    if (!client) {
      ctx.skip();
      return;
    }

    try {
      // Fresh nameSpace-equivalent isolation: @fastify/rate-limit keys
      // requests by a nameSpace + IP/route combo, and app.ts hardcodes
      // nameSpace 'tradosphere-auth-rl-'. Flushing this test's own client's
      // DB before use keeps this run independent of any previous run's
      // leftover counters against the same real Redis instance.
      await client.flushdb();

      const app = await buildApp({
        userRepo: new InMemoryUserRepository(),
        sessionRepo: new InMemorySessionRepository(),
        jwtSecret: JWT_SECRET,
        logger: createLogger('auth-service-test'),
        redis: client,
        rateLimit: { max: 3, timeWindowMs: 60_000 },
      });

      const attempt = () =>
        app.inject({
          method: 'POST',
          url: '/login',
          payload: { email: 'nobody@tradosphere.os', password: 'wrong-password' },
        });

      const first = await attempt();
      const second = await attempt();
      const third = await attempt();
      const fourth = await attempt();

      expect(first.statusCode).toBe(401);
      expect(second.statusCode).toBe(401);
      expect(third.statusCode).toBe(401);
      expect(fourth.statusCode).toBe(429);
    } finally {
      await client.flushdb();
      client.disconnect();
    }
  });
});

describe('rate-limit fail-closed behavior (no real Redis needed)', () => {
  // Unlike the suite above, this one does NOT need a live Redis and is not
  // skipped in this sandbox -- it only needs a connection attempt that is
  // guaranteed to fail, which loopback port 1 (nothing ever listens there)
  // provides deterministically via an immediate ECONNREFUSED, no external
  // infrastructure required. This directly exercises app.ts's documented
  // skipOnError: false default: per Cipher's review, a Redis outage must
  // fail loudly (500), never silently disable throttling.
  it('returns 500 rather than silently skipping rate limiting when Redis is unreachable', async () => {
    const unreachable = new Redis({
      host: '127.0.0.1',
      port: 1,
      lazyConnect: true,
      retryStrategy: () => null,
      maxRetriesPerRequest: 1,
      connectTimeout: 500,
    });
    // Required or an uncaught 'error' event crashes the process -- same
    // reasoning as index.ts's pool/redis error handlers.
    unreachable.on('error', () => {});

    try {
      const app = await buildApp({
        userRepo: new InMemoryUserRepository(),
        sessionRepo: new InMemorySessionRepository(),
        jwtSecret: JWT_SECRET,
        logger: createLogger('auth-service-test'),
        redis: unreachable,
        rateLimit: { max: 3, timeWindowMs: 60_000 },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'nobody@tradosphere.os', password: 'wrong-password' },
      });
      expect(res.statusCode).toBe(500);
    } finally {
      unreachable.disconnect();
    }
  });
});
