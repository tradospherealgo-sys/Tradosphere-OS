process.env.LOG_LEVEL = 'silent'; // keep test output clean; still a real pino instance

import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createLogger } from '@tradosphere/logger';
import { signAccessToken } from '@tradosphere/auth';
import { buildApp } from '../src/app';
import { InMemoryJournalEntrySource, InMemoryEquitySnapshotSource, InMemoryAnalyticsRepository } from './fakes';

// Fastify's inject() drives the real route/preHandler/error-handler chain
// in-process, with no open port and no real Postgres -- same HTTP-contract
// testing approach as services/portfolio/test/app.test.ts and
// services/education/test/app.test.ts. Every one of the 16 routes below is
// gated by the exact same requireAuth(deps) preHandler instance and every
// route reports on the authenticated caller's own trading history only
// (app.ts's own top-of-file comment), so authentication is proven once,
// broadly, in one describe block, rather than duplicated sixteen times; the
// per-route describes below focus on each route's own wiring and a small
// number of representative, hand-verified computed values -- the exhaustive
// edge-case coverage for every business-logic function already lives in the
// 12 unit test files (trade-stats.test.ts, risk-reward.test.ts, etc.), so
// this suite is deliberately about proving app.ts wires request -> real
// computation -> response correctly, not re-deriving that math a second
// time.
//
// This service issues no tokens of its own (no /signup or /login route), so
// every authenticated test mints one directly with signAccessToken -- same
// pattern services/portfolio/test/app.test.ts and services/education/test/
// app.test.ts use.
//
// Every fixture below flows through the real journalEntrySource/
// equitySnapshotSource/analyticsRepository in-memory ports (test/fakes.ts)
// and the real src/*.ts compute functions -- nothing here hand-constructs a
// response body, so a bug in app.ts's wiring would show up here even though
// the math itself is already covered unit-by-unit.

const JWT_SECRET = 'test-secret-not-for-prod';

describe('services/analytics HTTP surface', () => {
  let app: FastifyInstance;
  let journalEntrySource: InMemoryJournalEntrySource;
  let equitySnapshotSource: InMemoryEquitySnapshotSource;
  let analyticsRepository: InMemoryAnalyticsRepository;
  let token: string;

  beforeEach(async () => {
    journalEntrySource = new InMemoryJournalEntrySource();
    equitySnapshotSource = new InMemoryEquitySnapshotSource();
    analyticsRepository = new InMemoryAnalyticsRepository();

    app = await buildApp({
      journalEntrySource,
      equitySnapshotSource,
      analyticsRepository,
      jwtSecret: JWT_SECRET,
      logger: createLogger('analytics-service-test'),
    });

    token = signAccessToken({ sub: 'user-1', role: 'trader' }, JWT_SECRET);
  });

  function authed() {
    return { headers: { authorization: `Bearer ${token}` } };
  }

  function tokenFor(sub: string): string {
    return signAccessToken({ sub, role: 'trader' }, JWT_SECRET);
  }

  // -------------------------------------------------------------------
  // Authentication -- proven once, broadly, since all 16 routes below
  // share the exact same requireAuth(deps) preHandler instance (app.ts).
  // -------------------------------------------------------------------

  describe('authentication', () => {
    const routes: Array<{ method: 'GET' | 'POST'; url: string }> = [
      { method: 'GET', url: '/analytics/win-rate' },
      { method: 'GET', url: '/analytics/average-return' },
      { method: 'GET', url: '/analytics/risk-reward' },
      { method: 'GET', url: '/analytics/expectancy' },
      { method: 'GET', url: '/analytics/drawdown' },
      { method: 'GET', url: '/analytics/risk-adjusted-returns' },
      { method: 'GET', url: '/analytics/performance' },
      { method: 'GET', url: '/analytics/monthly-reports' },
      { method: 'GET', url: '/analytics/strategy-stats' },
      { method: 'GET', url: '/analytics/trade-distribution' },
      { method: 'GET', url: '/analytics/heatmap' },
      { method: 'GET', url: '/analytics/session-analysis' },
      { method: 'GET', url: '/analytics/instrument-analysis' },
      { method: 'POST', url: '/analytics/reports' },
      { method: 'GET', url: '/analytics/reports' },
      { method: 'GET', url: '/analytics/reports/00000000-0000-0000-0000-000000000000' },
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
        url: '/analytics/win-rate',
        headers: { authorization: 'Bearer not-a-real-jwt' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBeTypeOf('string');
    });

    it('accepts any authenticated role -- there is no admin/trader split on account-private analytics', async () => {
      const res = await app.inject({ method: 'GET', url: '/analytics/win-rate', ...authed() });
      expect(res.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------
  // GET /analytics/win-rate
  // -------------------------------------------------------------------

  describe('GET /analytics/win-rate', () => {
    it('returns null with no closed trades', async () => {
      const res = await app.inject({ method: 'GET', url: '/analytics/win-rate', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ winRate: null });
    });

    it('computes the real win rate from the authenticated user\'s own closed trades only', async () => {
      journalEntrySource.addEntry({ userId: 'user-1', status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: 200 });
      journalEntrySource.addEntry({ userId: 'user-1', status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: -100 });
      journalEntrySource.addEntry({ userId: 'user-2', status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: 500 }); // another user -- must be excluded

      const res = await app.inject({ method: 'GET', url: '/analytics/win-rate', ...authed() });
      expect(res.json()).toEqual({ winRate: 0.5 });
    });

    it('applies from/to as an inclusive range over filledAtIso', async () => {
      journalEntrySource.addEntry({ filledAtIso: '2026-01-10T00:00:00.000Z', status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: 100 });
      journalEntrySource.addEntry({ filledAtIso: '2026-02-10T00:00:00.000Z', status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: -100 });

      const res = await app.inject({
        method: 'GET',
        url: '/analytics/win-rate',
        query: { from: '2026-02-01T00:00:00.000Z', to: '2026-02-28T23:59:59.000Z' },
        ...authed(),
      });
      expect(res.json()).toEqual({ winRate: 0 });
    });

    it('rejects an invalid from/to query param with 400', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/analytics/win-rate',
        query: { from: 'not-a-date' },
        ...authed(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation failed');
    });
  });

  // -------------------------------------------------------------------
  // GET /analytics/average-return
  // -------------------------------------------------------------------

  describe('GET /analytics/average-return', () => {
    it('returns both fields null with no closed trades', async () => {
      const res = await app.inject({ method: 'GET', url: '/analytics/average-return', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ averageReturn: null, averageReturnPct: null });
    });

    it('computes real averageReturn and averageReturnPct from closed trades', async () => {
      journalEntrySource.addEntry({ status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', quantity: 10, fillPrice: 100, realizedPnl: 200 });
      journalEntrySource.addEntry({ status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', quantity: 10, fillPrice: 100, realizedPnl: -100 });

      const res = await app.inject({ method: 'GET', url: '/analytics/average-return', ...authed() });
      expect(res.json()).toEqual({ averageReturn: 50, averageReturnPct: 0.05 });
    });
  });

  // -------------------------------------------------------------------
  // GET /analytics/risk-reward
  // -------------------------------------------------------------------

  describe('GET /analytics/risk-reward', () => {
    it('returns both ratios null with no data', async () => {
      const res = await app.inject({ method: 'GET', url: '/analytics/risk-reward', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ plannedRiskRewardRatio: null, realizedRiskRewardRatio: null });
    });

    it('computes real planned and realized risk/reward ratios', async () => {
      journalEntrySource.addEntry({ status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: 200, recommendedRiskRewardRatio: 3 });
      journalEntrySource.addEntry({ status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: -100, recommendedRiskRewardRatio: 1 });

      const res = await app.inject({ method: 'GET', url: '/analytics/risk-reward', ...authed() });
      expect(res.json()).toEqual({ plannedRiskRewardRatio: 2, realizedRiskRewardRatio: 2 });
    });
  });

  // -------------------------------------------------------------------
  // GET /analytics/expectancy
  // -------------------------------------------------------------------

  describe('GET /analytics/expectancy', () => {
    it('returns null with no decisive (win/loss) trades', async () => {
      const res = await app.inject({ method: 'GET', url: '/analytics/expectancy', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ expectancy: null });
    });

    it('computes real expectancy from win/loss trades', async () => {
      journalEntrySource.addEntry({ status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: 200 });
      journalEntrySource.addEntry({ status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: -100 });

      const res = await app.inject({ method: 'GET', url: '/analytics/expectancy', ...authed() });
      expect(res.json()).toEqual({ expectancy: 50 });
    });
  });

  // -------------------------------------------------------------------
  // GET /analytics/drawdown
  // -------------------------------------------------------------------

  describe('GET /analytics/drawdown', () => {
    it('returns null with fewer than 2 equity snapshots', async () => {
      const res = await app.inject({ method: 'GET', url: '/analytics/drawdown', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ maxDrawdownPct: null });
    });

    it('computes the real max drawdown from the equity curve', async () => {
      // Same multi-peak curve verified independently in drawdown.test.ts:
      // 100 -> 80 -> 120 -> 60, max drawdown from the 120 peak to the 60
      // trough is exactly 0.5.
      equitySnapshotSource.addSnapshot({ totalEquity: 100, asOfIso: '2026-01-01T00:00:00.000Z' });
      equitySnapshotSource.addSnapshot({ totalEquity: 80, asOfIso: '2026-01-02T00:00:00.000Z' });
      equitySnapshotSource.addSnapshot({ totalEquity: 120, asOfIso: '2026-01-03T00:00:00.000Z' });
      equitySnapshotSource.addSnapshot({ totalEquity: 60, asOfIso: '2026-01-04T00:00:00.000Z' });

      const res = await app.inject({ method: 'GET', url: '/analytics/drawdown', ...authed() });
      expect(res.json()).toEqual({ maxDrawdownPct: 0.5 });
    });
  });

  // -------------------------------------------------------------------
  // GET /analytics/risk-adjusted-returns
  // -------------------------------------------------------------------

  describe('GET /analytics/risk-adjusted-returns', () => {
    it('reports insufficientData with fewer than 3 equity snapshots', async () => {
      equitySnapshotSource.addSnapshot({ totalEquity: 100, asOfIso: '2026-01-01T00:00:00.000Z' });
      equitySnapshotSource.addSnapshot({ totalEquity: 110, asOfIso: '2026-01-02T00:00:00.000Z' });

      const res = await app.inject({ method: 'GET', url: '/analytics/risk-adjusted-returns', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ sharpeRatio: null, sortinoRatio: null, insufficientData: true });
    });

    it('reports insufficientData:false but both ratios null for a zero-variance return series', async () => {
      // Same identical-+10%-twice case verified independently in
      // risk-adjusted-returns.test.ts: two consecutive periods with exactly
      // the same return make the sample stddev exactly 0, so both ratios
      // are mathematically undefined (reported as null, not Infinity).
      equitySnapshotSource.addSnapshot({ totalEquity: 100, asOfIso: '2026-01-01T00:00:00.000Z' });
      equitySnapshotSource.addSnapshot({ totalEquity: 110, asOfIso: '2026-01-02T00:00:00.000Z' });
      equitySnapshotSource.addSnapshot({ totalEquity: 121, asOfIso: '2026-01-03T00:00:00.000Z' });

      const res = await app.inject({ method: 'GET', url: '/analytics/risk-adjusted-returns', ...authed() });
      expect(res.json()).toEqual({ sharpeRatio: null, sortinoRatio: null, insufficientData: false });
    });
  });

  // -------------------------------------------------------------------
  // GET /analytics/performance -- combined rollup
  // -------------------------------------------------------------------

  describe('GET /analytics/performance', () => {
    it('returns the full stat set with real zeros/nulls when there is no data at all', async () => {
      const res = await app.inject({ method: 'GET', url: '/analytics/performance', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        breakevenTrades: 0,
        openTrades: 0,
        totalRealizedPnl: 0,
        winRate: null,
        averageReturn: null,
        averageReturnPct: null,
        expectancy: null,
        plannedRiskRewardRatio: null,
        realizedRiskRewardRatio: null,
        maxDrawdownPct: null,
        sharpeRatio: null,
        sortinoRatio: null,
      });
    });

    it('assembles every field from real data -- one win, one loss, no snapshots', async () => {
      journalEntrySource.addEntry({
        status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z',
        quantity: 10,
        fillPrice: 100,
        realizedPnl: 200,
        recommendedRiskRewardRatio: 3,
      });
      journalEntrySource.addEntry({
        status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z',
        quantity: 10,
        fillPrice: 100,
        realizedPnl: -100,
        recommendedRiskRewardRatio: 1,
      });

      const res = await app.inject({ method: 'GET', url: '/analytics/performance', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        totalTrades: 2,
        winningTrades: 1,
        losingTrades: 1,
        breakevenTrades: 0,
        openTrades: 0,
        totalRealizedPnl: 100,
        winRate: 0.5,
        averageReturn: 50,
        averageReturnPct: 0.05,
        expectancy: 50,
        plannedRiskRewardRatio: 2,
        realizedRiskRewardRatio: 2,
        maxDrawdownPct: null, // no snapshots at all
        sharpeRatio: null,
        sortinoRatio: null,
      });
    });
  });

  // -------------------------------------------------------------------
  // GET /analytics/monthly-reports
  // -------------------------------------------------------------------

  describe('GET /analytics/monthly-reports', () => {
    it('returns an empty array with no entries', async () => {
      const res = await app.inject({ method: 'GET', url: '/analytics/monthly-reports', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ reports: [] });
    });

    it('groups real entries into one row per UTC calendar month, sorted chronologically', async () => {
      journalEntrySource.addEntry({ filledAtIso: '2026-02-15T10:00:00.000Z', status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: -50 });
      journalEntrySource.addEntry({ filledAtIso: '2026-01-15T10:00:00.000Z', status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: 100 });

      const res = await app.inject({ method: 'GET', url: '/analytics/monthly-reports', ...authed() });
      const { reports } = res.json() as { reports: Array<{ month: { key: string }; totalTrades: number; totalRealizedPnl: number }> };
      expect(reports).toHaveLength(2);
      expect(reports.map((r) => r.month.key)).toEqual(['2026-01', '2026-02']);
      expect(reports[0].totalTrades).toBe(1);
      expect(reports[0].totalRealizedPnl).toBe(100);
      expect(reports[1].totalRealizedPnl).toBe(-50);
    });
  });

  // -------------------------------------------------------------------
  // GET /analytics/strategy-stats
  // -------------------------------------------------------------------

  describe('GET /analytics/strategy-stats', () => {
    it('returns an empty array with no entries', async () => {
      const res = await app.inject({ method: 'GET', url: '/analytics/strategy-stats', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ strategies: [] });
    });

    it('groups real entries by cioVerdictLabel + recommendedDirection', async () => {
      journalEntrySource.addEntry({
        status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z',
        realizedPnl: 100,
        cioVerdictLabel: 'bullish',
        recommendedDirection: 'long',
      });
      journalEntrySource.addEntry({
        status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z',
        realizedPnl: 200,
        cioVerdictLabel: 'bullish',
        recommendedDirection: 'long',
      });

      const res = await app.inject({ method: 'GET', url: '/analytics/strategy-stats', ...authed() });
      const { strategies } = res.json() as { strategies: Array<{ strategy: { key: string }; totalTrades: number; totalRealizedPnl: number }> };
      expect(strategies).toHaveLength(1);
      expect(strategies[0].strategy.key).toBe('bullish__long');
      expect(strategies[0].totalTrades).toBe(2);
      expect(strategies[0].totalRealizedPnl).toBe(300);
    });
  });

  // -------------------------------------------------------------------
  // GET /analytics/trade-distribution
  // -------------------------------------------------------------------

  describe('GET /analytics/trade-distribution', () => {
    it('returns empty buckets and null min/max with no closed trades', async () => {
      const res = await app.inject({ method: 'GET', url: '/analytics/trade-distribution', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ buckets: [], minPnl: null, maxPnl: null });
    });

    it('defaults to DEFAULT_BUCKET_COUNT (10) buckets when no ?buckets query param is given', async () => {
      journalEntrySource.addEntry({ status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: -100 });
      journalEntrySource.addEntry({ status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: 100 });

      const res = await app.inject({ method: 'GET', url: '/analytics/trade-distribution', ...authed() });
      expect(res.json().buckets).toHaveLength(10);
    });

    it('honors a custom ?buckets query param', async () => {
      journalEntrySource.addEntry({ status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: -100 });
      journalEntrySource.addEntry({ status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: 100 });

      const res = await app.inject({
        method: 'GET',
        url: '/analytics/trade-distribution',
        query: { buckets: '2' },
        ...authed(),
      });
      expect(res.json().buckets).toHaveLength(2);
    });

    it('rejects a non-positive ?buckets query param with 400', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/analytics/trade-distribution',
        query: { buckets: '0' },
        ...authed(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation failed');
    });
  });

  // -------------------------------------------------------------------
  // GET /analytics/heatmap
  // -------------------------------------------------------------------

  describe('GET /analytics/heatmap', () => {
    it('always returns exactly 28 cells even with no trades', async () => {
      const res = await app.inject({ method: 'GET', url: '/analytics/heatmap', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json().cells).toHaveLength(28);
    });

    it('places a real trade in the cell matching its own UTC day-of-week and session window', async () => {
      // 2026-01-21 is a Wednesday; 14:00 UTC falls in h12_18 -- same fixture
      // independently verified in heatmap.test.ts.
      journalEntrySource.addEntry({ filledAtIso: '2026-01-21T14:00:00.000Z', status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: 100 });

      const res = await app.inject({ method: 'GET', url: '/analytics/heatmap', ...authed() });
      const { cells } = res.json() as { cells: Array<{ dayOfWeek: string; session: string; totalTrades: number }> };
      const cell = cells.find((c) => c.dayOfWeek === 'wednesday' && c.session === 'h12_18')!;
      expect(cell.totalTrades).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // GET /analytics/session-analysis
  // -------------------------------------------------------------------

  describe('GET /analytics/session-analysis', () => {
    it('always returns exactly one row per SESSION_WINDOWS entry, even with no trades', async () => {
      const res = await app.inject({ method: 'GET', url: '/analytics/session-analysis', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json().sessions).toHaveLength(4);
    });

    it('buckets real trades by the UTC hour of their own filledAtIso', async () => {
      journalEntrySource.addEntry({ filledAtIso: '2026-01-01T03:00:00.000Z', status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: 100 });
      journalEntrySource.addEntry({ filledAtIso: '2026-01-01T09:00:00.000Z', status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: -50 });

      const res = await app.inject({ method: 'GET', url: '/analytics/session-analysis', ...authed() });
      const { sessions } = res.json() as { sessions: Array<{ session: string; totalTrades: number }> };
      expect(sessions.find((s) => s.session === 'h00_06')?.totalTrades).toBe(1);
      expect(sessions.find((s) => s.session === 'h06_12')?.totalTrades).toBe(1);
      expect(sessions.find((s) => s.session === 'h12_18')?.totalTrades).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // GET /analytics/instrument-analysis
  // -------------------------------------------------------------------

  describe('GET /analytics/instrument-analysis', () => {
    it('returns an empty array with no entries', async () => {
      const res = await app.inject({ method: 'GET', url: '/analytics/instrument-analysis', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ instruments: [] });
    });

    it('groups real entries by symbol, most-traded first', async () => {
      journalEntrySource.addEntry({ symbol: 'AAPL', status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: 100 });
      journalEntrySource.addEntry({ symbol: 'AAPL', status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: -50 });
      journalEntrySource.addEntry({ symbol: 'TSLA', status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z', realizedPnl: 200 });

      const res = await app.inject({ method: 'GET', url: '/analytics/instrument-analysis', ...authed() });
      const { instruments } = res.json() as { instruments: Array<{ symbol: string; totalTrades: number }> };
      expect(instruments[0]).toMatchObject({ symbol: 'AAPL', totalTrades: 2 });
      expect(instruments[1]).toMatchObject({ symbol: 'TSLA', totalTrades: 1 });
    });
  });

  // -------------------------------------------------------------------
  // POST /analytics/reports -- the one persisted, write resource
  // -------------------------------------------------------------------

  describe('POST /analytics/reports', () => {
    it('persists a report with the real server-computed stat set and returns 201', async () => {
      journalEntrySource.addEntry({
        status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z',
        quantity: 10,
        fillPrice: 100,
        realizedPnl: 200,
        recommendedRiskRewardRatio: 3,
      });
      journalEntrySource.addEntry({
        status: 'closed', exitPrice: 110, exitAtIso: '2026-01-16T10:00:00.000Z',
        quantity: 10,
        fillPrice: 100,
        realizedPnl: -100,
        recommendedRiskRewardRatio: 1,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/analytics/reports',
        payload: { label: 'monthly-2026-01' },
        ...authed(),
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.userId).toBe('user-1');
      expect(body.label).toBe('monthly-2026-01');
      expect(body.totalTrades).toBe(2);
      expect(body.totalRealizedPnl).toBe(100);
      expect(body.winRate).toBe(0.5);
      expect(body.expectancy).toBe(50);

      // The persisted report must agree exactly with what GET
      // /analytics/performance says at this same moment -- app.ts's own
      // documented guarantee that both call the same computeFullStatSet().
      const perfRes = await app.inject({ method: 'GET', url: '/analytics/performance', ...authed() });
      const perf = perfRes.json();
      expect(body.totalTrades).toBe(perf.totalTrades);
      expect(body.winRate).toBe(perf.winRate);
      expect(body.expectancy).toBe(perf.expectancy);
      expect(body.plannedRiskRewardRatio).toBe(perf.plannedRiskRewardRatio);

      // Confirm it actually landed in the repository the route was given.
      const [persisted] = await analyticsRepository.listByUser('user-1');
      expect(persisted.id).toBe(body.id);
    });

    it('takes userId from the JWT, silently ignoring any userId the caller puts in the body', async () => {
      // createReportBodySchema (validation.ts) has no userId field at all,
      // so zod strips it rather than rejecting the request -- ownership
      // always comes from the token, never the request body, same rule
      // services/portfolio/test/app.test.ts already proves for its own
      // POST /portfolio/snapshot.
      const res = await app.inject({
        method: 'POST',
        url: '/analytics/reports',
        payload: { userId: 'someone-else', label: 'spoofed' },
        ...authed(),
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().userId).toBe('user-1');
    });

    it('succeeds with no request body at all, treating it the same as {}', async () => {
      const res = await app.inject({ method: 'POST', url: '/analytics/reports', ...authed() });
      expect(res.statusCode).toBe(201);
    });

    it('defaults label to null and asOf to roughly now when the body is an explicit empty object', async () => {
      const before = Date.now();
      const res = await app.inject({ method: 'POST', url: '/analytics/reports', payload: {}, ...authed() });
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
        url: '/analytics/reports',
        payload: { asOf: 'not-a-real-timestamp' },
        ...authed(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation failed');
      expect(res.json().details[0].path).toBe('asOf');
    });

    it('rejects a label over the 200-character limit with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/analytics/reports',
        payload: { label: 'x'.repeat(201) },
        ...authed(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation failed');
    });
  });

  // -------------------------------------------------------------------
  // GET /analytics/reports
  // -------------------------------------------------------------------

  describe('GET /analytics/reports', () => {
    it('returns an empty list with no reports', async () => {
      const res = await app.inject({ method: 'GET', url: '/analytics/reports', ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ reports: [] });
    });

    it('returns only the authenticated user\'s reports, newest first', async () => {
      const base = {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        breakevenTrades: 0,
        openTrades: 0,
        totalRealizedPnl: 0,
        winRate: null,
        averageReturn: null,
        averageReturnPct: null,
        expectancy: null,
        plannedRiskRewardRatio: null,
        realizedRiskRewardRatio: null,
        maxDrawdownPct: null,
        sharpeRatio: null,
        sortinoRatio: null,
      };
      await analyticsRepository.create({ ...base, userId: 'user-1', asOfIso: '2026-07-16T21:00:00.000Z' });
      await analyticsRepository.create({ ...base, userId: 'user-2', asOfIso: '2026-07-17T21:00:00.000Z' });
      await analyticsRepository.create({ ...base, userId: 'user-1', asOfIso: '2026-07-18T21:00:00.000Z' });

      const res = await app.inject({ method: 'GET', url: '/analytics/reports', ...authed() });
      expect(res.statusCode).toBe(200);
      const { reports } = res.json() as { reports: Array<{ userId: string; asOf: string }> };
      expect(reports).toHaveLength(2);
      expect(reports.every((r) => r.userId === 'user-1')).toBe(true);
      expect(reports.map((r) => r.asOf)).toEqual(['2026-07-18T21:00:00.000Z', '2026-07-16T21:00:00.000Z']);
    });

    it('applies from/to query params as inclusive bounds over asOf', async () => {
      const base = {
        userId: 'user-1',
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        breakevenTrades: 0,
        openTrades: 0,
        totalRealizedPnl: 0,
        winRate: null,
        averageReturn: null,
        averageReturnPct: null,
        expectancy: null,
        plannedRiskRewardRatio: null,
        realizedRiskRewardRatio: null,
        maxDrawdownPct: null,
        sharpeRatio: null,
        sortinoRatio: null,
      };
      await analyticsRepository.create({ ...base, asOfIso: '2026-07-16T21:00:00.000Z' });
      await analyticsRepository.create({ ...base, asOfIso: '2026-07-17T21:00:00.000Z' });
      await analyticsRepository.create({ ...base, asOfIso: '2026-07-18T21:00:00.000Z' });

      const res = await app.inject({
        method: 'GET',
        url: '/analytics/reports',
        query: { from: '2026-07-17T00:00:00.000Z', to: '2026-07-17T23:59:59.000Z' },
        ...authed(),
      });
      expect(res.statusCode).toBe(200);
      const { reports } = res.json() as { reports: Array<{ asOf: string }> };
      expect(reports).toHaveLength(1);
      expect(reports[0].asOf).toBe('2026-07-17T21:00:00.000Z');
    });
  });

  // -------------------------------------------------------------------
  // GET /analytics/reports/:id
  // -------------------------------------------------------------------

  describe('GET /analytics/reports/:id', () => {
    it('returns the report when it belongs to the authenticated user', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/analytics/reports',
        payload: { label: 'mine' },
        ...authed(),
      });
      const { id } = createRes.json();

      const res = await app.inject({ method: 'GET', url: `/analytics/reports/${id}`, ...authed() });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(id);
      expect(res.json().label).toBe('mine');
    });

    it('returns 404 when the id belongs to a different user -- indistinguishable from not found', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/analytics/reports',
        payload: { label: 'owner-only' },
        ...authed(),
      });
      const { id } = createRes.json();

      const intruderToken = tokenFor('user-2');
      const res = await app.inject({
        method: 'GET',
        url: `/analytics/reports/${id}`,
        headers: { authorization: `Bearer ${intruderToken}` },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toContain(id);
    });

    it('returns 404 when the id does not exist at all', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/analytics/reports/00000000-0000-0000-0000-000000000000',
        ...authed(),
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects a non-UUID id with 400', async () => {
      const res = await app.inject({ method: 'GET', url: '/analytics/reports/not-a-uuid', ...authed() });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation failed');
    });
  });
});
