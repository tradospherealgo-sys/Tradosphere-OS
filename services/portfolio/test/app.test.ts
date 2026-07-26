process.env.LOG_LEVEL = 'silent'; // keep test output clean; still a real pino instance

import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createLogger } from '@tradosphere/logger';
import { signAccessToken } from '@tradosphere/auth';
import { buildApp } from '../src/app';
import { InMemoryTradeRecordSource, InMemoryPriceSource, InMemoryPortfolioRepository } from './fakes';

// Fastify's inject() drives the real route/preHandler/error-handler chain
// in-process, with no open port and no real Postgres -- same HTTP-contract
// testing approach as services/auth/test/app.test.ts and
// services/education/test/app.test.ts. Unlike those two services, every
// route below is gated by the exact same requireAuth(deps) preHandler
// instance and there is no admin/trader split -- positions/cash/pnl are
// private account data, not a public/admin-authored content type (see
// app.ts's own top-of-file comment) -- so authentication is proven once,
// broadly, in one describe block, rather than duplicated nine times; the
// per-route describes below focus on each route's own business behavior.
//
// This service issues no tokens of its own (no /signup or /login route),
// so every authenticated test mints one directly with signAccessToken --
// the same pattern services/education/test/app.test.ts uses.
//
// Every trade/price fixture below flows through the real
// computePositions/computeCashBalance/computeMarkToMarket pipeline via the
// in-memory ports (test/fakes.ts) -- nothing here hand-constructs a
// response body, so a bug in the wiring between app.ts and src/*.ts would
// show up here even though the business-logic math itself is already
// covered unit-by-unit in positions.test.ts/cash.test.ts/mtm.test.ts/
// performance.test.ts/allocation.test.ts/risk.test.ts.

const JWT_SECRET = 'test-secret-not-for-prod';
const STARTING_CASH = 100_000;

describe('services/portfolio HTTP surface', () => {
  let app: FastifyInstance;
  let tradeRecordSource: InMemoryTradeRecordSource;
  let priceSource: InMemoryPriceSource;
  let portfolioRepository: InMemoryPortfolioRepository;
  let token: string;

  beforeEach(async () => {
    tradeRecordSource = new InMemoryTradeRecordSource();
    priceSource = new InMemoryPriceSource();
    portfolioRepository = new InMemoryPortfolioRepository();

    app = await buildApp({
      tradeRecordSource,
      priceSource,
      portfolioRepository,
      startingCash: STARTING_CASH,
      jwtSecret: JWT_SECRET,
      logger: createLogger('portfolio-service-test'),
    });

    token = signAccessToken({ sub: 'user-1', role: 'trader' }, JWT_SECRET);
  });

  function authed() {
    return { headers: { authorization: `Bearer ${token}` } };
  }

  // -------------------------------------------------------------------
  // Authentication -- proven once, broadly, since all 9 routes below
  // share the exact same requireAuth(deps) preHandler instance (app.ts).
  // -------------------------------------------------------------------

  describe('authentication', () => {
    const routes: Array<{ method: 'GET' | 'POST'; url: string }> = [
      { method: 'GET', url: '/portfolio/positions' },
      { method: 'GET', url: '/portfolio/cash' },
      { method: 'GET', url: '/portfolio/pnl' },
      { method: 'GET', url: '/portfolio/summary' },
      { method: 'POST', url: '/portfolio/snapshot' },
      { method: 'GET', url: '/portfolio/history' },
      { method: 'GET', url: '/portfolio/performance' },
      { method: 'GET', url: '/portfolio/allocation' },
      { method: 'GET', url: '/portfolio/risk' },
    ];

    it('rejects every route with 401 when no bearer token is sent', async () => {
      for (const { method, url } of routes) {
        const res = await app.inject({ method, url });
        expect(res.statusCode, `${method} ${url}`).toBe(401);
        expect(res.json(), `${method} ${url}`).toEqual({ error: 'missing bearer token' });
      }
    });

    it('rejects a malformed/bad-signature token with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/portfolio/positions',
        headers: { authorization: 'Bearer not-a-real-jwt' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBeTypeOf('string');
    });

    it('accepts any authenticated role -- there is no admin/trader split on account-private data', async () => {
      const res = await app.inject({ method: 'GET', url: '/portfolio/positions', ...authed() });
      expect(res.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------
  // GET /portfolio/positions
  // -------------------------------------------------------------------

  describe('GET /portfolio/positions', () => {
    it('returns an empty list for a user with no trades', async () => {
      const res = await app.inject({ method: 'GET', url: '/portfolio/positions', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ positions: [] });
    });

    it('returns the real computed position for the authenticated user, excluding another user\'s trades', async () => {
      tradeRecordSource.addTrade({ userId: 'user-1', symbol: 'AAPL', side: 'buy', quantity: 10, fillPrice: 100, status: 'open' });
      tradeRecordSource.addTrade({ userId: 'user-2', symbol: 'TSLA', side: 'buy', quantity: 3, fillPrice: 300, status: 'open' });

      const res = await app.inject({ method: 'GET', url: '/portfolio/positions', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        positions: [{ symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 }],
      });
    });
  });

  // -------------------------------------------------------------------
  // GET /portfolio/cash
  // -------------------------------------------------------------------

  describe('GET /portfolio/cash', () => {
    it('returns the configured startingCash with no trades', async () => {
      const res = await app.inject({ method: 'GET', url: '/portfolio/cash', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ cashBalance: STARTING_CASH, startingCash: STARTING_CASH });
    });

    it('debits cashBalance for an open buy, leaving startingCash itself unchanged', async () => {
      tradeRecordSource.addTrade({ userId: 'user-1', symbol: 'AAPL', side: 'buy', quantity: 10, fillPrice: 100, status: 'open' });

      const res = await app.inject({ method: 'GET', url: '/portfolio/cash', ...authed() });
      expect(res.json()).toEqual({ cashBalance: STARTING_CASH - 1_000, startingCash: STARTING_CASH });
    });
  });

  // -------------------------------------------------------------------
  // GET /portfolio/pnl
  // -------------------------------------------------------------------

  describe('GET /portfolio/pnl', () => {
    it('reports zero P&L and no missing prices with no trades', async () => {
      const res = await app.inject({ method: 'GET', url: '/portfolio/pnl', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ realizedPnl: 0, unrealizedPnl: 0, missingPriceSymbols: [] });
    });

    it('flags an open position with no live price in missingPriceSymbols instead of guessing at unrealizedPnl', async () => {
      tradeRecordSource.addTrade({ userId: 'user-1', symbol: 'AAPL', side: 'buy', quantity: 10, fillPrice: 100, status: 'open' });
      // AAPL deliberately left unpriced.

      const res = await app.inject({ method: 'GET', url: '/portfolio/pnl', ...authed() });
      expect(res.json()).toEqual({ realizedPnl: 0, unrealizedPnl: 0, missingPriceSymbols: ['AAPL'] });
    });

    it('computes unrealizedPnl from a live price once one is set', async () => {
      tradeRecordSource.addTrade({ userId: 'user-1', symbol: 'AAPL', side: 'buy', quantity: 10, fillPrice: 100, status: 'open' });
      priceSource.setPrice('AAPL', 120, new Date().toISOString());

      const res = await app.inject({ method: 'GET', url: '/portfolio/pnl', ...authed() });
      expect(res.json()).toEqual({ realizedPnl: 0, unrealizedPnl: 200, missingPriceSymbols: [] });
    });
  });

  // -------------------------------------------------------------------
  // GET /portfolio/summary
  // -------------------------------------------------------------------

  describe('GET /portfolio/summary', () => {
    it('assembles the full mark-to-market view for a fully-priced book', async () => {
      tradeRecordSource.addTrade({ userId: 'user-1', symbol: 'AAPL', side: 'buy', quantity: 10, fillPrice: 100, status: 'open' });
      priceSource.setPrice('AAPL', 120, new Date().toISOString());

      const res = await app.inject({ method: 'GET', url: '/portfolio/summary', ...authed() });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({
        cashBalance: STARTING_CASH - 1_000,
        positionsValue: 1_200,
        realizedPnl: 0,
        unrealizedPnl: 200,
        totalEquity: STARTING_CASH + 200,
        positions: [{ symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 }],
        missingPriceSymbols: [],
      });
      // Decision D17's reconciliation identity holds whenever every open
      // position is priced (mtm.test.ts proves the math in isolation; this
      // just confirms app.ts serializes that same mtm result verbatim
      // rather than re-deriving or reshaping it).
      expect(body.totalEquity).toBe(body.cashBalance + body.positionsValue);
    });
  });

  // -------------------------------------------------------------------
  // POST /portfolio/snapshot
  // -------------------------------------------------------------------

  describe('POST /portfolio/snapshot', () => {
    it('persists a snapshot via the real repository and returns 201 with the created row', async () => {
      tradeRecordSource.addTrade({ userId: 'user-1', symbol: 'AAPL', side: 'buy', quantity: 10, fillPrice: 100, status: 'open' });
      priceSource.setPrice('AAPL', 120, new Date().toISOString());

      const res = await app.inject({
        method: 'POST',
        url: '/portfolio/snapshot',
        payload: { label: 'daily-mtm' },
        ...authed(),
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.userId).toBe('user-1');
      expect(body.label).toBe('daily-mtm');
      expect(body.cashBalance).toBe(STARTING_CASH - 1_000);
      expect(body.positionsValue).toBe(1_200);
      expect(body.totalEquity).toBe(STARTING_CASH + 200);

      // Confirm it actually landed in the repository the route was given,
      // not just in the HTTP response.
      const [persisted] = await portfolioRepository.listByUser('user-1');
      expect(persisted.id).toBe(body.id);
    });

    it('takes userId from the JWT, silently ignoring any userId the caller puts in the body', async () => {
      // createSnapshotBodySchema (validation.ts) has no userId field at all,
      // so zod strips it rather than rejecting the request -- ownership
      // always comes from the token, never the request body, same rule
      // services/education/test/app.test.ts already proves for its
      // progress/quiz-attempt endpoints.
      const res = await app.inject({
        method: 'POST',
        url: '/portfolio/snapshot',
        payload: { userId: 'someone-else', label: 'spoofed' },
        ...authed(),
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().userId).toBe('user-1');
    });

    it('succeeds with no request body at all (no Content-Type), treating it the same as {}', async () => {
      const res = await app.inject({ method: 'POST', url: '/portfolio/snapshot', ...authed() });
      expect(res.statusCode).toBe(201);
    });

    it('defaults label to null and asOf to roughly now when the body is an explicit empty object', async () => {
      const before = Date.now();
      const res = await app.inject({ method: 'POST', url: '/portfolio/snapshot', payload: {}, ...authed() });
      const after = Date.now();

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.label).toBeNull();
      const asOfMs = new Date(body.asOf).getTime();
      expect(asOfMs).toBeGreaterThanOrEqual(before);
      expect(asOfMs).toBeLessThanOrEqual(after);
    });

    it('rejects an invalid body with 400 and field-level details', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/portfolio/snapshot',
        payload: { asOf: 'not-a-real-timestamp' },
        ...authed(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation failed');
      expect(res.json().details[0].path).toBe('asOf');
    });

    it('refuses to persist with 409 when an open position has no live price (IncompletePricingError)', async () => {
      tradeRecordSource.addTrade({ userId: 'user-1', symbol: 'AAPL', side: 'buy', quantity: 10, fillPrice: 100, status: 'open' });
      // AAPL deliberately left unpriced.

      const res = await app.inject({ method: 'POST', url: '/portfolio/snapshot', ...authed() });
      expect(res.statusCode).toBe(409);
      expect(res.json().missingPriceSymbols).toEqual(['AAPL']);

      // A 409 must never leave a partial/incomplete row behind -- errors.ts's
      // own reasoning for why this is checked before portfolioRepository.create
      // is ever called.
      const rows = await portfolioRepository.listByUser('user-1');
      expect(rows).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------
  // GET /portfolio/history
  // -------------------------------------------------------------------

  describe('GET /portfolio/history', () => {
    // Snapshots are seeded directly through the same in-memory
    // portfolioRepository the route reads from -- this suite is about
    // proving the route's query-to-listByUser wiring (ownership, from/to
    // mapping), not re-proving computeMarkToMarket's math, which
    // mtm.test.ts already covers exhaustively.

    it('returns an empty history array for a user with no snapshots', async () => {
      const res = await app.inject({ method: 'GET', url: '/portfolio/history', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ history: [] });
    });

    it('returns only the authenticated user\'s snapshots, ordered ascending by asOf', async () => {
      await portfolioRepository.create({
        userId: 'user-1',
        cashBalance: 100_000,
        positionsValue: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        totalEquity: 100_000,
        asOfIso: '2026-07-18T21:00:00.000Z',
      });
      await portfolioRepository.create({
        userId: 'user-2',
        cashBalance: 100_000,
        positionsValue: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        totalEquity: 100_000,
        asOfIso: '2026-07-17T21:00:00.000Z',
      });
      await portfolioRepository.create({
        userId: 'user-1',
        cashBalance: 100_500,
        positionsValue: 0,
        realizedPnl: 500,
        unrealizedPnl: 0,
        totalEquity: 100_500,
        asOfIso: '2026-07-16T21:00:00.000Z',
      });

      const res = await app.inject({ method: 'GET', url: '/portfolio/history', ...authed() });
      expect(res.statusCode).toBe(200);
      const { history } = res.json() as { history: Array<{ userId: string; asOf: string }> };
      expect(history).toHaveLength(2);
      expect(history.every((row) => row.userId === 'user-1')).toBe(true);
      expect(history.map((row) => row.asOf)).toEqual(['2026-07-16T21:00:00.000Z', '2026-07-18T21:00:00.000Z']);
    });

    it('applies from/to query params as inclusive bounds', async () => {
      const base = {
        userId: 'user-1',
        cashBalance: 100_000,
        positionsValue: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        totalEquity: 100_000,
      };
      await portfolioRepository.create({ ...base, asOfIso: '2026-07-16T21:00:00.000Z' });
      await portfolioRepository.create({ ...base, asOfIso: '2026-07-17T21:00:00.000Z' });
      await portfolioRepository.create({ ...base, asOfIso: '2026-07-18T21:00:00.000Z' });

      const res = await app.inject({
        method: 'GET',
        url: '/portfolio/history',
        query: { from: '2026-07-17T00:00:00.000Z', to: '2026-07-17T23:59:59.000Z' },
        ...authed(),
      });
      expect(res.statusCode).toBe(200);
      const { history } = res.json() as { history: Array<{ asOf: string }> };
      expect(history).toHaveLength(1);
      expect(history[0].asOf).toBe('2026-07-17T21:00:00.000Z');
    });

    it('rejects an invalid from/to query param with 400', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/portfolio/history',
        query: { from: 'not-a-date' },
        ...authed(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation failed');
    });
  });

  // -------------------------------------------------------------------
  // GET /portfolio/performance
  // -------------------------------------------------------------------

  describe('GET /portfolio/performance', () => {
    it('reports zero return with no trades', async () => {
      const res = await app.inject({ method: 'GET', url: '/portfolio/performance', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        startingCash: STARTING_CASH,
        totalEquity: STARTING_CASH,
        totalReturn: 0,
        totalReturnPct: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
      });
    });

    it('reports a positive return once a priced position has gained value', async () => {
      tradeRecordSource.addTrade({ userId: 'user-1', symbol: 'AAPL', side: 'buy', quantity: 100, fillPrice: 100, status: 'open' });
      priceSource.setPrice('AAPL', 110, new Date().toISOString());

      const res = await app.inject({ method: 'GET', url: '/portfolio/performance', ...authed() });
      const body = res.json();
      expect(body.totalReturn).toBe(1_000);
      expect(body.totalReturnPct).toBeCloseTo(0.01);
      expect(body.unrealizedPnl).toBe(1_000);
    });
  });

  // -------------------------------------------------------------------
  // GET /portfolio/allocation
  // -------------------------------------------------------------------

  describe('GET /portfolio/allocation', () => {
    it('returns an empty allocation with no priced positions', async () => {
      const res = await app.inject({ method: 'GET', url: '/portfolio/allocation', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ allocation: [], missingPriceSymbols: [] });
    });

    it('splits allocation across two offsetting positions and separately flags the unpriced one', async () => {
      tradeRecordSource.addTrade({ userId: 'user-1', symbol: 'AAPL', side: 'buy', quantity: 10, fillPrice: 100, status: 'open' });
      tradeRecordSource.addTrade({ userId: 'user-1', symbol: 'TSLA', side: 'sell', quantity: 10, fillPrice: 100, status: 'open' });
      tradeRecordSource.addTrade({ userId: 'user-1', symbol: 'MSFT', side: 'buy', quantity: 5, fillPrice: 50, status: 'open' });
      priceSource.setPrice('AAPL', 100, new Date().toISOString());
      priceSource.setPrice('TSLA', 100, new Date().toISOString());
      // MSFT deliberately left unpriced -- excluded from allocation and
      // flagged in missingPriceSymbols instead, same contract GET
      // /portfolio/pnl and /portfolio/summary already use.

      const res = await app.inject({ method: 'GET', url: '/portfolio/allocation', ...authed() });
      const body = res.json();
      expect(body.missingPriceSymbols).toEqual(['MSFT']);
      expect(body.allocation).toEqual([
        { symbol: 'AAPL', direction: 'long', marketValue: 1_000, allocationPct: 0.5 },
        { symbol: 'TSLA', direction: 'short', marketValue: -1_000, allocationPct: 0.5 },
      ]);
    });
  });

  // -------------------------------------------------------------------
  // GET /portfolio/risk
  // -------------------------------------------------------------------

  describe('GET /portfolio/risk', () => {
    it('returns all zeros with no priced positions', async () => {
      const res = await app.inject({ method: 'GET', url: '/portfolio/risk', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        grossExposure: 0,
        netExposure: 0,
        leverageRatio: 0,
        largestPositionPct: 0,
        missingPriceSymbols: [],
      });
    });

    it('computes gross/net exposure and leverageRatio against totalEquity for a priced book', async () => {
      tradeRecordSource.addTrade({ userId: 'user-1', symbol: 'AAPL', side: 'buy', quantity: 10, fillPrice: 100, status: 'open' });
      priceSource.setPrice('AAPL', 120, new Date().toISOString());

      const res = await app.inject({ method: 'GET', url: '/portfolio/risk', ...authed() });
      const body = res.json();
      expect(body.grossExposure).toBe(1_200);
      expect(body.netExposure).toBe(1_200);
      expect(body.largestPositionPct).toBe(1);
      // totalEquity here is startingCash + unrealizedPnl = 100_000 + 200.
      expect(body.leverageRatio).toBeCloseTo(1_200 / 100_200);
      expect(body.missingPriceSymbols).toEqual([]);
    });
  });
});
