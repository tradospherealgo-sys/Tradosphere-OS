import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Logger } from '@tradosphere/logger';
import { verifyAccessToken, InvalidTokenError, type Role } from '@tradosphere/auth';
import type { JournalEntrySource, JournalEntryRecord } from './journal-source';
import type { EquitySnapshotSource, EquitySnapshotRecord } from './equity-source';
import type { AnalyticsRepository } from './analytics-repository';
import {
  computeTradeCounts,
  computeWinRate,
  computeAverageReturn,
  computeAverageReturnPct,
  closedTradesOf,
} from './trade-stats';
import { computePlannedRiskRewardRatio, computeRealizedRiskRewardRatio } from './risk-reward';
import { computeExpectancy } from './expectancy';
import { computeMaxDrawdownPct } from './drawdown';
import { computeRiskAdjustedReturns } from './risk-adjusted-returns';
import { computeMonthlyReports } from './monthly-reports';
import { computeStrategyStats } from './strategy-stats';
import { computeTradeDistribution } from './trade-distribution';
import { computeSessionAnalysis } from './session-analysis';
import { computeInstrumentAnalysis } from './instrument-analysis';
import { computeHeatmap } from './heatmap';
import { ReportNotFoundError } from './errors';
import {
  validateBody,
  rangeQuerySchema,
  tradeDistributionQuerySchema,
  createReportBodySchema,
  listReportsQuerySchema,
  reportIdParamsSchema,
  type RangeQuery,
} from './validation';

// Sprint 8.4: the Fastify app for services/analytics -- the Performance
// API. Every route reports on the authenticated caller's own trading
// history, never another user's, so there is no public/admin split here:
// every route below requires requireAuth (any role), and userId is always
// request.authUser!.sub, never trusted from a query param or body (same
// "never let a caller act as a different user" rule services/portfolio's
// and services/education's routes already establish).
//
// Every GET route is computed fresh from journal_entries + portfolio_
// snapshots on every call (Decision D18) -- nothing here is cached, same
// "compute on demand" precedent services/portfolio's app.ts uses for
// positions/cash/pnl/summary. The one write route, POST /analytics/reports,
// persists exactly the same computeFullStatSet() result GET /analytics/
// performance would return at that moment -- the two can never disagree,
// because both call the same function.
//
// Routes are deliberately granular (one per named Sprint 8.4 deliverable:
// win-rate, average-return, risk-reward, drawdown, risk-adjusted-returns
// [Sharpe+Sortino], expectancy, monthly-reports, strategy-stats, trade-
// distribution, heatmap, session-analysis, instrument-analysis) PLUS one
// combined /performance rollup -- the same "granular routes plus one
// combined rollup" shape services/portfolio's app.ts already establishes
// (/positions, /cash, /pnl alongside /summary). Sharpe and Sortino share
// one route (risk-adjusted-returns) rather than two: computeRiskAdjusted
// Returns() derives both from the same period-returns pass and the same
// insufficientData flag, so splitting them into separate routes would
// either recompute the same series twice or awkwardly split one cohesive
// result across two responses.

export interface AppDeps {
  journalEntrySource: JournalEntrySource;
  equitySnapshotSource: EquitySnapshotSource;
  analyticsRepository: AnalyticsRepository;
  jwtSecret: string;
  logger: Logger;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: { sub: string; role: Role };
  }
}

// Identical shape to every other service's requireAuth -- same JWT, same
// verifyAccessToken/InvalidTokenError contract from @tradosphere/auth.
function requireAuth(deps: AppDeps) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing bearer token' });
    }
    const token = header.slice('Bearer '.length);
    try {
      request.authUser = verifyAccessToken(token, deps.jwtSecret);
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        return reply.code(401).send({ error: err.message });
      }
      throw err;
    }
  };
}

// Every stat column app.ts can report, in one shape -- the exact fields
// analytics-schema.ts's analyticsReports table has (minus id/userId/label/
// fromDate/toDate/asOf/createdAt, which are request- or database-assigned,
// not computed). GET /analytics/performance returns this directly; POST
// /analytics/reports spreads it into analytics-repository.ts's
// CreateReportInput -- one function, two callers, so they can never
// disagree.
interface FullStatSet {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  openTrades: number;
  totalRealizedPnl: number;
  winRate: number | null;
  averageReturn: number | null;
  averageReturnPct: number | null;
  expectancy: number | null;
  plannedRiskRewardRatio: number | null;
  realizedRiskRewardRatio: number | null;
  maxDrawdownPct: number | null;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
}

function computeFullStatSet(entries: JournalEntryRecord[], snapshots: EquitySnapshotRecord[]): FullStatSet {
  const counts = computeTradeCounts(entries);
  const closed = closedTradesOf(entries);
  const totalRealizedPnl = closed.reduce((sum, t) => sum + t.realizedPnl, 0);
  const riskAdjusted = computeRiskAdjustedReturns(snapshots);

  return {
    ...counts,
    totalRealizedPnl,
    winRate: computeWinRate(entries),
    averageReturn: computeAverageReturn(entries),
    averageReturnPct: computeAverageReturnPct(entries),
    expectancy: computeExpectancy(entries),
    plannedRiskRewardRatio: computePlannedRiskRewardRatio(entries),
    realizedRiskRewardRatio: computeRealizedRiskRewardRatio(entries),
    maxDrawdownPct: computeMaxDrawdownPct(snapshots),
    sharpeRatio: riskAdjusted.sharpeRatio,
    sortinoRatio: riskAdjusted.sortinoRatio,
  };
}

// Bounds a set of entries/snapshots to an optional [from, to] window over
// their own event timestamps (filledAtIso / asOfIso respectively) -- an
// absent bound means "no floor"/"no ceiling", never a fabricated default
// range (rangeQuerySchema's own contract). Applied in-memory rather than
// pushed into JournalEntrySource/EquitySnapshotSource's queries: both ports
// already return a user's complete history in one call (Decision D18), and
// every stat module in this service (trade-stats.ts, drawdown.ts, etc.)
// operates on a plain array, so filtering here keeps the range concept
// entirely inside app.ts rather than growing the read ports' query surface
// for what is purely a reporting-layer concern.
function filterEntriesByRange(entries: JournalEntryRecord[], from?: string, to?: string): JournalEntryRecord[] {
  if (!from && !to) return entries;
  const fromMs = from ? Date.parse(from) : -Infinity;
  const toMs = to ? Date.parse(to) : Infinity;
  return entries.filter((e) => {
    const filledMs = Date.parse(e.filledAtIso);
    return filledMs >= fromMs && filledMs <= toMs;
  });
}

function filterSnapshotsByRange(snapshots: EquitySnapshotRecord[], from?: string, to?: string): EquitySnapshotRecord[] {
  if (!from && !to) return snapshots;
  const fromMs = from ? Date.parse(from) : -Infinity;
  const toMs = to ? Date.parse(to) : Infinity;
  return snapshots.filter((s) => {
    const asOfMs = Date.parse(s.asOfIso);
    return asOfMs >= fromMs && asOfMs <= toMs;
  });
}

// Shared by every read route below -- loads the user's full history from
// both ports in parallel (they are independent reads, Decision D18), then
// applies the same optional range window to each. Centralizing this means
// every route's range semantics are identical by construction, never
// subtly different per handler.
async function loadFilteredData(
  deps: AppDeps,
  userId: string,
  range: RangeQuery,
): Promise<{ entries: JournalEntryRecord[]; snapshots: EquitySnapshotRecord[] }> {
  const [allEntries, allSnapshots] = await Promise.all([
    deps.journalEntrySource.listByUser(userId),
    deps.equitySnapshotSource.listByUser(userId),
  ]);
  return {
    entries: filterEntriesByRange(allEntries, range.from, range.to),
    snapshots: filterSnapshotsByRange(allSnapshots, range.from, range.to),
  };
}

// The only place this service builds its HTTP surface -- index.ts just
// supplies real dependencies (Drizzle-backed adapters, a real pg Pool) and
// calls listen(). Tests supply in-memory fakes (test/fakes.ts) and call
// app.inject() instead, so every route below is covered without a real
// Postgres or open port.
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify's FastifyBaseLogger typing doesn't structurally match a real
    // pino instance byte-for-byte even though pino is Fastify's own default
    // logger -- same cast, same reasoning every other service's app.ts uses.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
    logger: deps.logger as any,
    genReqId: () => randomUUID(),
  });

  const authed = requireAuth(deps);

  // -----------------------------------------------------------------------
  // Granular stat routes -- one per named Sprint 8.4 deliverable
  // -----------------------------------------------------------------------

  app.get('/analytics/win-rate', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(rangeQuerySchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const { entries } = await loadFilteredData(deps, request.authUser!.sub, validation.data);
    return reply.send({ winRate: computeWinRate(entries) });
  });

  app.get('/analytics/average-return', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(rangeQuerySchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const { entries } = await loadFilteredData(deps, request.authUser!.sub, validation.data);
    return reply.send({
      averageReturn: computeAverageReturn(entries),
      averageReturnPct: computeAverageReturnPct(entries),
    });
  });

  app.get('/analytics/risk-reward', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(rangeQuerySchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const { entries } = await loadFilteredData(deps, request.authUser!.sub, validation.data);
    return reply.send({
      plannedRiskRewardRatio: computePlannedRiskRewardRatio(entries),
      realizedRiskRewardRatio: computeRealizedRiskRewardRatio(entries),
    });
  });

  app.get('/analytics/expectancy', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(rangeQuerySchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const { entries } = await loadFilteredData(deps, request.authUser!.sub, validation.data);
    return reply.send({ expectancy: computeExpectancy(entries) });
  });

  app.get('/analytics/drawdown', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(rangeQuerySchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const { snapshots } = await loadFilteredData(deps, request.authUser!.sub, validation.data);
    return reply.send({ maxDrawdownPct: computeMaxDrawdownPct(snapshots) });
  });

  app.get('/analytics/risk-adjusted-returns', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(rangeQuerySchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const { snapshots } = await loadFilteredData(deps, request.authUser!.sub, validation.data);
    return reply.send(computeRiskAdjustedReturns(snapshots));
  });

  // -----------------------------------------------------------------------
  // Combined rollup -- same "granular routes plus one combined summary"
  // shape services/portfolio's app.ts establishes for /summary
  // -----------------------------------------------------------------------

  app.get('/analytics/performance', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(rangeQuerySchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const { entries, snapshots } = await loadFilteredData(deps, request.authUser!.sub, validation.data);
    return reply.send(computeFullStatSet(entries, snapshots));
  });

  // -----------------------------------------------------------------------
  // Breakdown & distribution routes
  // -----------------------------------------------------------------------

  app.get('/analytics/monthly-reports', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(rangeQuerySchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const { entries } = await loadFilteredData(deps, request.authUser!.sub, validation.data);
    return reply.send({ reports: computeMonthlyReports(entries) });
  });

  app.get('/analytics/strategy-stats', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(rangeQuerySchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const { entries } = await loadFilteredData(deps, request.authUser!.sub, validation.data);
    return reply.send({ strategies: computeStrategyStats(entries) });
  });

  app.get('/analytics/trade-distribution', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(tradeDistributionQuerySchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const { entries } = await loadFilteredData(deps, request.authUser!.sub, validation.data);
    return reply.send(computeTradeDistribution(entries, validation.data.buckets));
  });

  app.get('/analytics/heatmap', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(rangeQuerySchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const { entries } = await loadFilteredData(deps, request.authUser!.sub, validation.data);
    return reply.send({ cells: computeHeatmap(entries) });
  });

  app.get('/analytics/session-analysis', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(rangeQuerySchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const { entries } = await loadFilteredData(deps, request.authUser!.sub, validation.data);
    return reply.send({ sessions: computeSessionAnalysis(entries) });
  });

  app.get('/analytics/instrument-analysis', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(rangeQuerySchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const { entries } = await loadFilteredData(deps, request.authUser!.sub, validation.data);
    return reply.send({ instruments: computeInstrumentAnalysis(entries) });
  });

  // -----------------------------------------------------------------------
  // Reports -- the one persisted resource this service owns (Decision D18:
  // analytics_reports is the only new table; everything else above is
  // computed fresh on every call)
  // -----------------------------------------------------------------------

  app.post('/analytics/reports', { preHandler: authed }, async (request, reply) => {
    // Every field is optional (validation.ts's createReportBodySchema), so
    // a caller sending no body at all leaves request.body undefined --
    // treat that the same as an explicit `{}` rather than failing
    // validation on a request that has nothing wrong with it (same
    // reasoning services/portfolio's POST /portfolio/snapshot uses).
    const validation = validateBody(createReportBodySchema, request.body ?? {});
    if (!validation.success) return reply.code(400).send(validation.failure);

    const { entries, snapshots } = await loadFilteredData(deps, request.authUser!.sub, {
      from: validation.data.from,
      to: validation.data.to,
    });
    const stats = computeFullStatSet(entries, snapshots);

    const report = await deps.analyticsRepository.create({
      userId: request.authUser!.sub,
      label: validation.data.label,
      fromIso: validation.data.from,
      toIso: validation.data.to,
      ...stats,
      asOfIso: validation.data.asOf ?? new Date().toISOString(),
    });
    return reply.code(201).send(report);
  });

  app.get('/analytics/reports', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(listReportsQuerySchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const reports = await deps.analyticsRepository.listByUser(request.authUser!.sub, {
      fromIso: validation.data.from,
      toIso: validation.data.to,
    });
    return reply.send({ reports });
  });

  app.get('/analytics/reports/:id', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(reportIdParamsSchema, request.params);
    if (!validation.success) return reply.code(400).send(validation.failure);

    try {
      const report = await deps.analyticsRepository.getById(validation.data.id, request.authUser!.sub);
      if (!report) {
        throw new ReportNotFoundError(validation.data.id);
      }
      return reply.send(report);
    } catch (err) {
      if (err instanceof ReportNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });

  app.setErrorHandler((err, request, reply) => {
    // Every domain error this service raises is already caught and replied
    // to locally in the route it belongs to (ReportNotFoundError,
    // InvalidTokenError inside requireAuth). Anything reaching this point
    // is genuinely unexpected, so it logs loudly and returns a deliberately
    // generic 500 with no internal detail leaked to the client -- same
    // contract every other service's app.ts uses.
    request.log.error({ err }, 'unhandled error in analytics service');
    return reply.code(500).send({ error: 'internal server error' });
  });

  return app;
}
