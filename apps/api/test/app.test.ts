process.env.LOG_LEVEL = 'silent'; // keep test output clean; still a real pino instance

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import * as http from 'node:http';
import RedisMock from 'ioredis-mock';
import { createLogger } from '@tradosphere/logger';
import { signAccessToken } from '@tradosphere/auth';
import type { FundamentalsRepository, InsertResult, CompanyFinancials } from '@tradosphere/service-research';
import type { CompanyFundamentalsRow } from '@tradosphere/database';
import { buildApp, type AppDeps } from '../src/app';
import type { ProxyTarget } from '../src/proxy';
import {
  InMemoryPriceSource,
  InMemoryFundamentalsRepository,
  InMemoryJournalRepository,
  InMemoryEventBus,
} from './fakes';

// Task 9.15: the gateway's own HTTP-contract test suite. Fastify's inject()
// drives the real route/preHandler/error-handler chain in-process, with no
// open port and no real Postgres/Redis -- same approach as every other
// service's app.test.ts. Unlike a single-service suite, this one also has to
// prove the proxy layer (task 9.1) itself, which needs one small real
// http.Server standing in for "some downstream service" -- app.inject()
// alone can't exercise proxy.ts's own fetch() call, since that call really
// does hit the network (localhost).
//
// Scope discipline (per the research phase before writing this file): every
// research/AI-agent handler already has its own dedicated unit-test coverage
// in services/research and services/ai; every business-logic module here
// (placeOrder, journal outcome/pnl, buildCioVerdict) is likewise already
// covered service-by-service. This suite is deliberately about wiring --
// does app.ts call the right function with the right shape and return the
// right status code -- not a second copy of business-logic verification.
// Minimal/gap-shaped fixtures are therefore used throughout, matching the
// graceful-degradation contract every research module and AI agent already
// guarantees for insufficient input.

const JWT_SECRET = 'test-secret-not-for-prod';

// ---------------------------------------------------------------------------
// A tiny real HTTP server standing in for "any one of the five proxied
// services" -- proxy.ts's proxyRequest() does a real fetch(), so the proxy
// wiring can only be proven end-to-end against something actually listening.
// ---------------------------------------------------------------------------
function startFakeUpstream(): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      if (req.url === '/echo-auth') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ authorization: req.headers.authorization ?? null }));
        return;
      }
      if (req.url === '/not-found') {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString() }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

// A throwing fundamentals repository -- the one fake in this suite that
// exists purely to exercise setErrorHandler's generic 500 path, which no
// other fixture in the repo naturally triggers (every other error path here
// is a specific, expected typed error already mapped to a 4xx).
class ThrowingFundamentalsRepository implements FundamentalsRepository {
  async insertFinancials(_records: CompanyFinancials[]): Promise<InsertResult> {
    throw new Error('boom: unexpected failure');
  }
  async getLatestBySymbol(_symbol: string): Promise<CompanyFundamentalsRow | undefined> {
    throw new Error('boom: unexpected failure');
  }
}

describe('apps/api gateway HTTP surface', () => {
  let upstream: { server: http.Server; url: string };
  let proxyTargets: ProxyTarget[];

  beforeAll(async () => {
    upstream = await startFakeUpstream();
    // Mirrors index.ts's buildProxyTargets() shape (Decision D20): auth/
    // market-data/education strip their own full prefix (root-mounted
    // routes), portfolio/analytics strip only '/v1' (self-prefixed routes).
    proxyTargets = [
      { name: 'auth', prefix: '/v1/auth', stripPrefix: '/v1/auth', baseUrl: upstream.url },
      { name: 'market-data', prefix: '/v1/market-data', stripPrefix: '/v1/market-data', baseUrl: upstream.url },
      { name: 'education', prefix: '/v1/education', stripPrefix: '/v1/education', baseUrl: upstream.url },
      { name: 'portfolio', prefix: '/v1/portfolio', stripPrefix: '/v1', baseUrl: upstream.url },
      { name: 'analytics', prefix: '/v1/analytics', stripPrefix: '/v1', baseUrl: upstream.url },
    ];
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => upstream.server.close(() => resolve()));
  });

  let app: FastifyInstance;
  let priceSource: InMemoryPriceSource;
  let fundamentalsRepository: InMemoryFundamentalsRepository;
  let journalRepository: InMemoryJournalRepository;
  let eventBus: InMemoryEventBus;
  let token: string;

  // ioredis-mock >=6 persists its in-memory dataset across every instance
  // that resolves to the same host:port (it simulates a real shared Redis
  // server by design -- see node_modules/ioredis-mock/README.md "In v6 the
  // internals were rewritten... if the host and port is the same, the
  // context is now shared"). Since every `new RedisMock()` call in this file
  // defaults to the same host:port, without an explicit flushall() every
  // app built here would inherit rate-limit counters left behind by
  // whichever test ran before it -- exactly the cross-test bleed-through
  // that broke the dedicated low-max rate-limit test below. Flushing right
  // after construction gives each app its own effectively-isolated view of
  // the (still technically shared) store.
  async function freshRedis(): Promise<RedisMock> {
    const redis = new RedisMock();
    await redis.flushall();
    return redis;
  }

  async function buildTestApp(overrides: Partial<AppDeps> = {}): Promise<FastifyInstance> {
    return buildApp({
      proxyTargets,
      jwtSecret: JWT_SECRET,
      logger: createLogger('api-gateway-test'),
      redis: overrides.redis ?? (await freshRedis()),
      rateLimit: { max: 10_000, timeWindowMs: 60_000 },
      eventBus,
      fundamentalsRepository,
      journalRepository,
      priceSource,
      now: () => new Date('2026-07-26T12:00:00.000Z'),
      ...overrides,
    });
  }

  beforeEach(async () => {
    priceSource = new InMemoryPriceSource();
    fundamentalsRepository = new InMemoryFundamentalsRepository();
    journalRepository = new InMemoryJournalRepository();
    eventBus = new InMemoryEventBus();
    app = await buildTestApp();
    token = signAccessToken({ sub: 'user-1', role: 'trader' }, JWT_SECRET);
  });

  function authed() {
    return { headers: { authorization: `Bearer ${token}` } };
  }

  // -------------------------------------------------------------------
  // Infra routes (task 9.11/9.12) -- unversioned, no auth.
  // -------------------------------------------------------------------

  describe('infra routes', () => {
    it('GET /health returns ok with no auth required', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
    });

    it('GET /health/services fans out to every proxy target and reports ok when the fake upstream answers', async () => {
      const res = await app.inject({ method: 'GET', url: '/health/services' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        auth: 'ok',
        marketData: 'ok',
        education: 'ok',
        portfolio: 'ok',
        analytics: 'ok',
      });
    });

    it('GET /health/services reports unreachable for a target with nothing listening', async () => {
      // Decision D21: only a network-level failure counts as unreachable --
      // proven here with a target baseUrl nothing is bound to.
      const brokenTargets: ProxyTarget[] = [
        { name: 'auth', prefix: '/v1/auth', stripPrefix: '/v1/auth', baseUrl: 'http://127.0.0.1:1' },
      ];
      const brokenApp = await buildTestApp({ proxyTargets: brokenTargets });
      const res = await brokenApp.inject({ method: 'GET', url: '/health/services' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ auth: 'unreachable' });
    });

    it('GET /metrics exposes Prometheus text format including the gateway-specific counter', async () => {
      await app.inject({ method: 'GET', url: '/health' });
      const res = await app.inject({ method: 'GET', url: '/metrics' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.body).toContain('http_requests_total');
      expect(res.body).toContain('http_request_duration_seconds');
    });

    it('GET /openapi.yaml serves the committed spec verbatim from disk', async () => {
      const res = await app.inject({ method: 'GET', url: '/openapi.yaml' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/yaml');
      expect(res.body).toContain('openapi: 3.0.3');
    });

    it('GET /documentation serves the Swagger UI HTML shell', async () => {
      const res = await app.inject({ method: 'GET', url: '/documentation' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/html');
      expect(res.body).toContain('swagger-ui');
    });
  });

  // -------------------------------------------------------------------
  // Proxied routes (task 9.1) -- against the real fake upstream server.
  // -------------------------------------------------------------------

  describe('proxied routes', () => {
    it('strips the full prefix for root-mounted services (auth) before forwarding', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/auth/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
    });

    it('strips only /v1 for self-prefixed services (portfolio), preserving the service segment', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/portfolio/anything' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ method: 'GET', url: '/portfolio/anything', body: '' });
    });

    it('strips only /v1 for self-prefixed services (analytics)', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/analytics/win-rate' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ method: 'GET', url: '/analytics/win-rate', body: '' });
    });

    it('forwards the Authorization header through byte-for-byte (D20: downstream owns its own auth)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/education/echo-auth',
        headers: { authorization: 'Bearer some-caller-token' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ authorization: 'Bearer some-caller-token' });
    });

    it('forwards a request with no Authorization header at all (public downstream routes need none)', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/education/echo-auth' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ authorization: null });
    });

    it('relays a POST body verbatim to market-data', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/market-data/ingest',
        payload: { symbol: 'AAPL' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.method).toBe('POST');
      expect(body.url).toBe('/ingest');
      expect(JSON.parse(body.body)).toEqual({ symbol: 'AAPL' });
    });

    it('relays a genuine 4xx from the downstream service verbatim, never fabricating a response', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/auth/not-found' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not found' });
    });

    it('returns 502 when the proxy target is unreachable (network-level failure only)', async () => {
      const brokenTargets: ProxyTarget[] = [
        { name: 'auth', prefix: '/v1/auth', stripPrefix: '/v1/auth', baseUrl: 'http://127.0.0.1:1' },
      ];
      const brokenApp = await buildTestApp({ proxyTargets: brokenTargets });
      const res = await brokenApp.inject({ method: 'GET', url: '/v1/auth/health' });
      expect(res.statusCode).toBe(502);
      expect(res.json()).toEqual({ error: 'upstream service unreachable: auth' });
    });
  });

  // -------------------------------------------------------------------
  // Authentication -- proven once, broadly, across all 20 in-process
  // routes, since they all share the exact same requireAuth(deps)
  // preHandler instance (app.ts). Per-route describes below focus on
  // each route's own business/wiring behavior.
  // -------------------------------------------------------------------

  describe('authentication on in-process routes', () => {
    const routes: Array<{ method: 'GET' | 'POST'; url: string }> = [
      { method: 'POST', url: '/v1/research/technical' },
      { method: 'POST', url: '/v1/research/options' },
      { method: 'GET', url: '/v1/research/fundamentals/AAPL' },
      { method: 'POST', url: '/v1/research/sector' },
      { method: 'POST', url: '/v1/research/quant' },
      { method: 'POST', url: '/v1/ai/agents/technical' },
      { method: 'POST', url: '/v1/ai/agents/options' },
      { method: 'POST', url: '/v1/ai/agents/sector' },
      { method: 'POST', url: '/v1/ai/agents/quant' },
      { method: 'POST', url: '/v1/ai/agents/fundamental' },
      { method: 'POST', url: '/v1/ai/agents/indices' },
      { method: 'POST', url: '/v1/ai/agents/strategy' },
      { method: 'POST', url: '/v1/ai/agents/risk' },
      { method: 'POST', url: '/v1/ai/agents/education' },
      { method: 'POST', url: '/v1/cio/verdict' },
      { method: 'POST', url: '/v1/paper-trading/orders' },
      { method: 'POST', url: '/v1/journal/entries' },
      { method: 'GET', url: '/v1/journal/entries' },
      { method: 'GET', url: '/v1/journal/entries/some-id' },
      { method: 'POST', url: '/v1/journal/entries/some-id/outcome' },
    ];

    it('rejects every in-process route with 401 when no bearer token is sent', async () => {
      for (const { method, url } of routes) {
        const res = await app.inject({ method, url });
        expect(res.statusCode, `${method} ${url}`).toBe(401);
        expect(res.json(), `${method} ${url}`).toEqual({ error: 'missing bearer token' });
      }
    });

    it('rejects a malformed/bad-signature token with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/journal/entries',
        headers: { authorization: 'Bearer not-a-real-jwt' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBeTypeOf('string');
    });

    it('never applies auth to the five proxied routes (D19 (2))', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/education/echo-auth' });
      expect(res.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------
  // Research routes (task 9.2) -- minimal input exercises each module's
  // own graceful ResearchGap path; the math itself is unit-tested in
  // services/research.
  // -------------------------------------------------------------------

  describe('research routes', () => {
    it('POST /v1/research/technical returns a gap for insufficient history', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/research/technical',
        payload: { symbol: 'AAPL', bars: [] },
        ...authed(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('gap');
    });

    it('POST /v1/research/technical rejects an invalid body with 400 and field-level details', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/research/technical',
        payload: { bars: [] },
        ...authed(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation failed');
      expect(res.json().details[0].path).toBe('symbol');
    });

    it('POST /v1/research/options returns a gap for an empty option chain', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/research/options',
        payload: { symbol: 'AAPL', underlyingPrice: 150, strikes: [] },
        ...authed(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('gap');
    });

    it('GET /v1/research/fundamentals/:symbol returns an honest gap when nothing has been ingested', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/research/fundamentals/AAPL', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        status: 'gap',
        reason: 'missing_fundamentals',
        detail: 'no fundamentals have been ingested for AAPL',
      });
    });

    it('GET /v1/research/fundamentals/:symbol analyzes real seeded data', async () => {
      fundamentalsRepository.seed({ symbol: 'AAPL' });
      const res = await app.inject({ method: 'GET', url: '/v1/research/fundamentals/AAPL', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('ok');
      expect(res.json().symbol).toBe('AAPL');
    });

    it('POST /v1/research/sector returns a gap for empty bar sets', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/research/sector',
        payload: { sector: 'tech', sectorBars: [], benchmarkBars: [] },
        ...authed(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('gap');
    });

    it('POST /v1/research/quant returns a gap for an empty bar set', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/research/quant',
        payload: { symbol: 'AAPL', bars: [] },
        ...authed(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('gap');
    });
  });

  // -------------------------------------------------------------------
  // AI Council routes (task 9.2) -- a ResearchGap/empty-opinions input
  // exercises runAgent()'s own gap-handling path (already unit-tested
  // per-agent in services/ai); this proves only that app.ts wires the
  // right agent to the right route.
  // -------------------------------------------------------------------

  describe('AI council routes', () => {
    const gapBody = { status: 'gap', reason: 'insufficient_history', detail: 'not enough data' };

    it.each([
      ['/v1/ai/agents/technical', gapBody],
      ['/v1/ai/agents/options', gapBody],
      ['/v1/ai/agents/sector', { status: 'gap', reason: 'missing_sector_data', detail: 'no data' }],
      ['/v1/ai/agents/quant', gapBody],
      ['/v1/ai/agents/fundamental', { status: 'gap', reason: 'missing_fundamentals', detail: 'no data' }],
      ['/v1/ai/agents/indices', gapBody],
    ])('POST %s returns a neutral opinion for gap input', async (url, payload) => {
      const res = await app.inject({ method: 'POST', url, payload, ...authed() });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.expert).toBeTypeOf('string');
      expect(body.verdict).toBeTypeOf('string');
    });

    it.each(['/v1/ai/agents/strategy', '/v1/ai/agents/education'])(
      'POST %s returns a synthesis opinion for an empty opinions array',
      async (url) => {
        const res = await app.inject({ method: 'POST', url, payload: { opinions: [] }, ...authed() });
        expect(res.statusCode).toBe(200);
        expect(res.json().expert).toBeTypeOf('string');
      },
    );

    it('POST /v1/ai/agents/risk returns an opinion for an empty opinions array', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/agents/risk',
        payload: { opinions: [] },
        ...authed(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().expert).toBeTypeOf('string');
    });

    it('POST /v1/ai/agents/technical rejects an invalid body with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/ai/agents/technical',
        payload: { not: 'a valid shape' },
        ...authed(),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------
  // CIO route (task 9.2/9.14) -- proves both the response wiring and the
  // publish-to-CIO_VERDICTS_CHANNEL side effect (task 9.14).
  // -------------------------------------------------------------------

  describe('POST /v1/cio/verdict', () => {
    const minimalBody = {
      symbol: 'AAPL',
      opinions: [],
      referencePrice: 150,
      portfolio: {
        currentDrawdownPct: 0,
        maxDrawdownPct: 20,
        currentExposurePct: 0,
        maxExposurePct: 100,
      },
      dataValid: false,
    };

    it('computes a verdict and publishes it onto CIO_VERDICTS_CHANNEL', async () => {
      const res = await app.inject({ method: 'POST', url: '/v1/cio/verdict', payload: minimalBody, ...authed() });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.verdict).toBeTypeOf('string');
      expect(eventBus.published).toHaveLength(1);
      expect(eventBus.published[0].channel).toBe('cio.verdicts');
      expect(eventBus.published[0].payload).toEqual(body);
    });

    it('rejects an invalid body with 400', async () => {
      const res = await app.inject({ method: 'POST', url: '/v1/cio/verdict', payload: { symbol: 'AAPL' }, ...authed() });
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------
  // Paper Trading route (task 9.2) -- the three execution.ts outcomes.
  // -------------------------------------------------------------------

  describe('POST /v1/paper-trading/orders', () => {
    it('fills against the real latest price when one exists', async () => {
      priceSource.setPrice('AAPL', 150, '2026-07-26T11:00:00.000Z');
      const res = await app.inject({
        method: 'POST',
        url: '/v1/paper-trading/orders',
        payload: { symbol: 'AAPL', side: 'buy', quantity: 10 },
        ...authed(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        symbol: 'AAPL',
        side: 'buy',
        quantity: 10,
        price: 150,
        filledAtIso: '2026-07-26T12:00:00.000Z',
        priceAsOfIso: '2026-07-26T11:00:00.000Z',
      });
    });

    it('returns 404 (never a fabricated fill) when no market data exists for the symbol', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/paper-trading/orders',
        payload: { symbol: 'ZZZZ', side: 'buy', quantity: 10 },
        ...authed(),
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toContain('no market data available');
    });

    it('returns 400 for a non-positive quantity (InvalidOrderError)', async () => {
      priceSource.setPrice('AAPL', 150, '2026-07-26T11:00:00.000Z');
      const res = await app.inject({
        method: 'POST',
        url: '/v1/paper-trading/orders',
        payload: { symbol: 'AAPL', side: 'buy', quantity: -5 },
        ...authed(),
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a malformed body with 400 before reaching execution.ts at all', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/paper-trading/orders',
        payload: { symbol: 'AAPL', side: 'sideways', quantity: 10 },
        ...authed(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation failed');
    });
  });

  // -------------------------------------------------------------------
  // Journal routes (task 9.2) -- proves userId always comes from the
  // JWT, and every one of repository.ts's typed errors maps correctly.
  // -------------------------------------------------------------------

  describe('journal routes', () => {
    const fill = {
      symbol: 'AAPL',
      side: 'buy' as const,
      quantity: 10,
      price: 150,
      filledAtIso: '2026-07-26T11:00:00.000Z',
      priceAsOfIso: '2026-07-26T11:00:00.000Z',
    };

    it('POST /v1/journal/entries creates an entry, taking userId from the JWT even if the body tries to spoof it', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/journal/entries',
        payload: { userId: 'someone-else', fill },
        ...authed(),
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().userId).toBe('user-1');
      expect(res.json().symbol).toBe('AAPL');
      expect(res.json().status).toBe('open');
    });

    it('POST /v1/journal/entries rejects an invalid body with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/journal/entries',
        payload: {},
        ...authed(),
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /v1/journal/entries lists only the authenticated user\'s own entries', async () => {
      await journalRepository.create({ userId: 'user-1', fill });
      await journalRepository.create({ userId: 'user-2', fill });

      const res = await app.inject({ method: 'GET', url: '/v1/journal/entries', ...authed() });
      expect(res.statusCode).toBe(200);
      const { entries } = res.json();
      expect(entries).toHaveLength(1);
      expect(entries[0].userId).toBe('user-1');
    });

    it('GET /v1/journal/entries/:id returns the entry when it exists', async () => {
      const created = await journalRepository.create({ userId: 'user-1', fill });
      const res = await app.inject({ method: 'GET', url: `/v1/journal/entries/${created.id}`, ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(created.id);
    });

    it('GET /v1/journal/entries/:id returns 404 for an unknown id', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/journal/entries/does-not-exist', ...authed() });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('journal entry not found: does-not-exist');
    });

    it('POST /v1/journal/entries/:id/outcome closes the entry and records realized P&L', async () => {
      const created = await journalRepository.create({ userId: 'user-1', fill });
      const res = await app.inject({
        method: 'POST',
        url: `/v1/journal/entries/${created.id}/outcome`,
        payload: { exitPrice: 160, exitAtIso: '2026-07-26T13:00:00.000Z' },
        ...authed(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('closed');
      expect(res.json().realizedPnl).toBe(100);
    });

    it('POST /v1/journal/entries/:id/outcome returns 404 for an unknown id (NotFoundError)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/journal/entries/does-not-exist/outcome',
        payload: { exitPrice: 160, exitAtIso: '2026-07-26T13:00:00.000Z' },
        ...authed(),
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /v1/journal/entries/:id/outcome returns 409 when already closed (AlreadyClosedError)', async () => {
      const created = await journalRepository.create({ userId: 'user-1', fill });
      await app.inject({
        method: 'POST',
        url: `/v1/journal/entries/${created.id}/outcome`,
        payload: { exitPrice: 160, exitAtIso: '2026-07-26T13:00:00.000Z' },
        ...authed(),
      });
      const res = await app.inject({
        method: 'POST',
        url: `/v1/journal/entries/${created.id}/outcome`,
        payload: { exitPrice: 170, exitAtIso: '2026-07-26T14:00:00.000Z' },
        ...authed(),
      });
      expect(res.statusCode).toBe(409);
    });

    it('POST /v1/journal/entries/:id/outcome returns 400 for a non-positive exitPrice (InvalidOutcomeError)', async () => {
      const created = await journalRepository.create({ userId: 'user-1', fill });
      const res = await app.inject({
        method: 'POST',
        url: `/v1/journal/entries/${created.id}/outcome`,
        payload: { exitPrice: -1, exitAtIso: '2026-07-26T13:00:00.000Z' },
        ...authed(),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------
  // Rate limiting (task 9.10) -- a dedicated low-max app instance, kept
  // separate from every other describe block so no other test's request
  // volume can spuriously trip a 429.
  // -------------------------------------------------------------------

  describe('rate limiting', () => {
    it('returns 429 with the error-handler\'s shape once the limit is exceeded', async () => {
      const limitedApp = await buildTestApp({ rateLimit: { max: 1, timeWindowMs: 60_000 }, redis: await freshRedis() });
      const first = await limitedApp.inject({ method: 'GET', url: '/health' });
      expect(first.statusCode).toBe(200);
      const second = await limitedApp.inject({ method: 'GET', url: '/health' });
      expect(second.statusCode).toBe(429);
      expect(second.json().error).toBeTypeOf('string');
    });
  });

  // -------------------------------------------------------------------
  // Generic error handler (task 9.9) -- an unexpected, untyped error from
  // a dependency must never leak internals, only the generic 500 shape.
  // -------------------------------------------------------------------

  describe('generic 500 error handler', () => {
    it('returns a generic message for an unexpected error, never the raw exception detail', async () => {
      const throwingApp = await buildTestApp({ fundamentalsRepository: new ThrowingFundamentalsRepository() });
      const res = await throwingApp.inject({ method: 'GET', url: '/v1/research/fundamentals/AAPL', ...authed() });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'internal server error' });
    });
  });
});
