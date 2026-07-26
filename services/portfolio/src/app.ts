import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Logger } from '@tradosphere/logger';
import { verifyAccessToken, InvalidTokenError, type Role } from '@tradosphere/auth';
import type { TradeRecordSource } from './trade-record-source';
import type { PriceSource } from './price-source';
import type { PortfolioRepository } from './portfolio-repository';
import { computePositions } from './positions';
import { computeCashBalance } from './cash';
import { computeMarkToMarket } from './mtm';
import { computePerformanceMetrics } from './performance';
import { computeAllocation } from './allocation';
import { computeRiskExposure } from './risk';
import { IncompletePricingError } from './errors';
import { validateBody, createSnapshotBodySchema, historyQuerySchema } from './validation';

// Sprint 8.3: the Fastify app for services/portfolio. Every route reports
// on the authenticated caller's own account -- positions, cash, and P&L are
// private account data, never a public/admin-authored content type like
// services/education's five content models -- so there is no public/admin
// split here: every route below requires requireAuth (any role), and
// userId is always request.authUser!.sub, never trusted from a query param
// or body (same "never let a caller act as a different user" rule
// education's progress/quiz-attempt endpoints already established).
//
// Nothing here is cached: positions/cash/pnl/summary/performance/
// allocation/risk are computed fresh from journal_entries + market_ticks on
// every call (Decision D17). The one write route, POST /portfolio/snapshot,
// is also the only place an incompletely-priced result is refused outright
// rather than returned with a flagged gap -- see errors.ts's
// IncompletePricingError.

export interface AppDeps {
  tradeRecordSource: TradeRecordSource;
  priceSource: PriceSource;
  portfolioRepository: PortfolioRepository;
  startingCash: number;
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
  // Holdings & cash
  // -----------------------------------------------------------------------

  app.get('/portfolio/positions', { preHandler: authed }, async (request, reply) => {
    const trades = await deps.tradeRecordSource.listByUser(request.authUser!.sub);
    return reply.send({ positions: computePositions(trades) });
  });

  app.get('/portfolio/cash', { preHandler: authed }, async (request, reply) => {
    const trades = await deps.tradeRecordSource.listByUser(request.authUser!.sub);
    return reply.send({
      cashBalance: computeCashBalance(trades, deps.startingCash),
      startingCash: deps.startingCash,
    });
  });

  // -----------------------------------------------------------------------
  // P&L & portfolio summary -- Decision D17's central reconciliation
  // -----------------------------------------------------------------------

  app.get('/portfolio/pnl', { preHandler: authed }, async (request, reply) => {
    const mtm = await computeMarkToMarket(
      request.authUser!.sub,
      deps.tradeRecordSource,
      deps.priceSource,
      deps.startingCash,
    );
    return reply.send({
      realizedPnl: mtm.realizedPnl,
      unrealizedPnl: mtm.unrealizedPnl,
      missingPriceSymbols: mtm.missingPriceSymbols,
    });
  });

  app.get('/portfolio/summary', { preHandler: authed }, async (request, reply) => {
    const mtm = await computeMarkToMarket(
      request.authUser!.sub,
      deps.tradeRecordSource,
      deps.priceSource,
      deps.startingCash,
    );
    return reply.send({
      cashBalance: mtm.cashBalance,
      positionsValue: mtm.positionsValue,
      realizedPnl: mtm.realizedPnl,
      unrealizedPnl: mtm.unrealizedPnl,
      totalEquity: mtm.totalEquity,
      positions: mtm.positions,
      missingPriceSymbols: mtm.missingPriceSymbols,
    });
  });

  // -----------------------------------------------------------------------
  // Daily MTM snapshot -> Equity Curve / Portfolio History (one mechanism,
  // Decision D17)
  // -----------------------------------------------------------------------

  app.post('/portfolio/snapshot', { preHandler: authed }, async (request, reply) => {
    // Every field is optional (validation.ts's createSnapshotBodySchema), so
    // a caller sending no body at all (no Content-Type) leaves
    // request.body undefined -- treat that the same as an explicit `{}`
    // rather than failing validation on a request that has nothing wrong
    // with it.
    const validation = validateBody(createSnapshotBodySchema, request.body ?? {});
    if (!validation.success) return reply.code(400).send(validation.failure);

    const mtm = await computeMarkToMarket(
      request.authUser!.sub,
      deps.tradeRecordSource,
      deps.priceSource,
      deps.startingCash,
    );

    try {
      if (mtm.missingPriceSymbols.length > 0) {
        throw new IncompletePricingError(mtm.missingPriceSymbols);
      }
      const snapshot = await deps.portfolioRepository.create({
        userId: request.authUser!.sub,
        cashBalance: mtm.cashBalance,
        positionsValue: mtm.positionsValue,
        realizedPnl: mtm.realizedPnl,
        unrealizedPnl: mtm.unrealizedPnl,
        totalEquity: mtm.totalEquity,
        label: validation.data.label,
        asOfIso: validation.data.asOf ?? new Date().toISOString(),
      });
      return reply.code(201).send(snapshot);
    } catch (err) {
      if (err instanceof IncompletePricingError) {
        return reply.code(409).send({ error: err.message, missingPriceSymbols: err.missingPriceSymbols });
      }
      throw err;
    }
  });

  app.get('/portfolio/history', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(historyQuerySchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const history = await deps.portfolioRepository.listByUser(request.authUser!.sub, {
      fromIso: validation.data.from,
      toIso: validation.data.to,
    });
    return reply.send({ history });
  });

  // -----------------------------------------------------------------------
  // Performance, allocation, risk -- each derived from one
  // computeMarkToMarket call so they can never disagree about what price
  // was used for a given symbol within the same request.
  // -----------------------------------------------------------------------

  app.get('/portfolio/performance', { preHandler: authed }, async (request, reply) => {
    const mtm = await computeMarkToMarket(
      request.authUser!.sub,
      deps.tradeRecordSource,
      deps.priceSource,
      deps.startingCash,
    );
    return reply.send(computePerformanceMetrics(mtm, deps.startingCash));
  });

  app.get('/portfolio/allocation', { preHandler: authed }, async (request, reply) => {
    const mtm = await computeMarkToMarket(
      request.authUser!.sub,
      deps.tradeRecordSource,
      deps.priceSource,
      deps.startingCash,
    );
    return reply.send({
      allocation: computeAllocation(mtm.pricedPositions),
      missingPriceSymbols: mtm.missingPriceSymbols,
    });
  });

  app.get('/portfolio/risk', { preHandler: authed }, async (request, reply) => {
    const mtm = await computeMarkToMarket(
      request.authUser!.sub,
      deps.tradeRecordSource,
      deps.priceSource,
      deps.startingCash,
    );
    return reply.send({
      ...computeRiskExposure(mtm.pricedPositions, mtm.totalEquity),
      missingPriceSymbols: mtm.missingPriceSymbols,
    });
  });

  app.setErrorHandler((err, request, reply) => {
    // Every domain error this service raises is already caught and replied
    // to locally in the route it belongs to (IncompletePricingError,
    // InvalidTokenError inside requireAuth). Anything reaching this point is
    // genuinely unexpected, so it logs loudly and returns a deliberately
    // generic 500 with no internal detail leaked to the client -- same
    // contract every other service's app.ts uses.
    request.log.error({ err }, 'unhandled error in portfolio service');
    return reply.code(500).send({ error: 'internal server error' });
  });

  return app;
}
