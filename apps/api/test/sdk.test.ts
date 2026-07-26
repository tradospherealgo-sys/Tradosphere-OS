process.env.LOG_LEVEL = 'silent'; // keep test output clean; still a real pino instance

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import RedisMock from 'ioredis-mock';
import { createLogger } from '@tradosphere/logger';
import { signAccessToken } from '@tradosphere/auth';
import { TradosphereClient, SdkHttpError } from '@tradosphere/sdk';
import { buildApp } from '../src/app';
import type { ProxyTarget } from '../src/proxy';
import { InMemoryPriceSource, InMemoryFundamentalsRepository, InMemoryJournalRepository, InMemoryEventBus } from './fakes';

// Task 9.15 (Blocker B17): Sprint 9's exit criterion #3 (SPRINT_BOOK.md) is
// "Generated SDK compiles and successfully calls a live endpoint." Before
// this file, packages/sdk had zero tests (its own package.json `test` script
// was a stub `echo "no tests yet"`) and nothing repo-wide ever instantiated
// TradosphereClient -- app.test.ts proves the gateway works via Fastify's
// inject(), which never touches the SDK's own HttpClient/fetch/token-
// injection/error-normalization code at all. This suite closes that gap the
// way the criterion is literally worded: it starts the real gateway on a
// real bound TCP port (app.listen(), not inject()) and drives it exclusively
// through the real @tradosphere/sdk client using the real global fetch --
// the same code path a real frontend or script would use.
//
// Scope discipline: this is not a second copy of app.test.ts's per-route
// business-logic coverage. It exercises just enough surface (one public
// infra route, one auth-required round trip, one 401 path, one 404-mapped
// SdkHttpError) to prove the SDK itself -- URL building, Authorization
// header injection, JSON parsing, and non-2xx-to-SdkHttpError translation --
// actually works against a live server, not just in isolation against a
// mocked fetch.

const JWT_SECRET = 'test-secret-not-for-prod';

describe('@tradosphere/sdk against a live apps/api gateway', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let token: string;

  beforeAll(async () => {
    // No proxied targets are exercised here (that's app.test.ts's job) --
    // an empty target list is a valid, real gateway configuration.
    const proxyTargets: ProxyTarget[] = [];
    const redis = new RedisMock();
    await redis.flushall();

    app = await buildApp({
      proxyTargets,
      jwtSecret: JWT_SECRET,
      logger: createLogger('api-gateway-sdk-test'),
      redis,
      rateLimit: { max: 10_000, timeWindowMs: 60_000 },
      eventBus: new InMemoryEventBus(),
      fundamentalsRepository: new InMemoryFundamentalsRepository(),
      journalRepository: new InMemoryJournalRepository(),
      priceSource: new InMemoryPriceSource(),
      now: () => new Date('2026-07-26T12:00:00.000Z'),
    });

    // A real listening TCP socket -- fetch() cannot reach app.inject()'s
    // in-process fake, so this is the one gateway test file that actually
    // binds a port.
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
    token = signAccessToken({ sub: 'sdk-test-user', role: 'trader' }, JWT_SECRET);
  });

  afterAll(async () => {
    await app.close();
  });

  it('calls the public GET /health endpoint through InfraClient with no token configured', async () => {
    const client = new TradosphereClient({ baseUrl });
    const health = await client.infra.health();
    expect(health).toEqual({ status: 'ok' });
  });

  it('injects the bearer token automatically and completes a real authenticated round trip', async () => {
    const client = new TradosphereClient({ baseUrl, getAccessToken: () => token });
    const entry = await client.journal.createEntry({
      fill: {
        symbol: 'AAPL',
        side: 'buy',
        quantity: 10,
        price: 150,
        filledAtIso: '2026-07-26T11:00:00.000Z',
        priceAsOfIso: '2026-07-26T11:00:00.000Z',
      },
    });
    expect(entry.symbol).toBe('AAPL');
    expect(entry.userId).toBe('sdk-test-user'); // proves the real JWT round-tripped through a real HTTP call
    expect(entry.status).toBe('open');

    const fetched = await client.journal.getEntry(entry.id);
    expect(fetched.id).toBe(entry.id);
  });

  it('surfaces a missing token as a real 401 SdkHttpError, not a thrown network error', async () => {
    const client = new TradosphereClient({ baseUrl }); // no getAccessToken configured
    await expect(client.journal.listEntries()).rejects.toMatchObject({
      name: 'SdkHttpError',
      status: 401,
    });
  });

  it('surfaces a genuine 404 from the gateway as an SdkHttpError with the real error body', async () => {
    const client = new TradosphereClient({ baseUrl, getAccessToken: () => token });
    try {
      await client.journal.getEntry('does-not-exist');
      expect.unreachable('expected getEntry to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SdkHttpError);
      const sdkErr = err as SdkHttpError;
      expect(sdkErr.status).toBe(404);
      expect(sdkErr.body).toEqual({ error: 'journal entry not found: does-not-exist' });
    }
  });
});
