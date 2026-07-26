import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import rateLimit from '@fastify/rate-limit';
import client from 'prom-client';
import type Redis from 'ioredis';
import type { Logger } from '@tradosphere/logger';
import { verifyAccessToken, InvalidTokenError, type Role } from '@tradosphere/auth';
import { CIO_VERDICTS_CHANNEL, type EventBus } from '@tradosphere/event-bus';
import {
  analyzeTechnical,
  analyzeOptionChain,
  analyzeSector,
  analyzeQuant,
  analyzeFundamentals,
  type FundamentalsRepository,
} from '@tradosphere/service-research';
import {
  TechnicalAgent,
  OptionsAgent,
  SectorAgent,
  QuantAgent,
  FundamentalAgent,
  IndicesAgent,
  StrategyAgent,
  RiskAgent,
  EducationAgent,
  runAgent,
} from '@tradosphere/service-ai';
import { buildCioVerdict } from '@tradosphere/service-cio';
import { placeOrder, NoMarketDataError, InvalidOrderError, type PriceSource } from '@tradosphere/service-paper-trading';
import { NotFoundError, AlreadyClosedError, InvalidOutcomeError, type JournalRepository } from '@tradosphere/service-journal';
import { registerProxy, type ProxyTarget } from './proxy';
import {
  validateBody,
  analyzeTechnicalBodySchema,
  optionChainSnapshotBodySchema,
  analyzeSectorBodySchema,
  analyzeQuantBodySchema,
  symbolParamSchema,
  technicalAnalysisResultSchema,
  optionAnalysisResultSchema,
  sectorAnalysisResultSchema,
  quantAnalysisResultSchema,
  fundamentalAnalysisResultSchema,
  opinionsOnlyBodySchema,
  riskAgentBodySchema,
  buildCioVerdictBodySchema,
  placeOrderBodySchema,
  createJournalEntryBodySchema,
  recordOutcomeBodySchema,
  idParamSchema,
} from './validation';

// Task 9.2/9.7/9.9/9.10/9.11/9.12/9.14: the gateway's own Fastify app --
// everything apps/api serves in-process, i.e. NOT one of the five
// proxy.ts-forwarded services. Decision D19 fixed the shape of every piece
// wired together here before any of it was written; each route/section
// below is annotated with which D19 sub-part or which pre-existing
// service's app.ts pattern it follows, per Forge charter rule 5
// (reuse-before-rewrite, cite the source).

export interface AppDeps {
  // The five proxied targets (task 9.1) -- registered here via
  // registerProxy so buildApp is the one place the whole gateway surface
  // (proxied + in-process) is assembled, and health/services fan-out below
  // can reuse the same baseUrl list rather than a second copy of it.
  proxyTargets: ProxyTarget[];
  jwtSecret: string;
  logger: Logger;
  redis: Redis;
  rateLimit: { max: number; timeWindowMs: number };
  eventBus: EventBus;
  fundamentalsRepository: FundamentalsRepository;
  journalRepository: JournalRepository;
  priceSource: PriceSource;
  // Injectable clock, forwarded to placeOrder's own PlaceOrderDeps --
  // same reasoning as services/paper-trading/src/execution.ts's own `now`.
  now?: () => Date;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: { sub: string; role: Role };
    // Set in an onRequest hook, read in onResponse, to compute request
    // duration for the http_request_duration_seconds histogram (task 9.12)
    // without depending on a Fastify-version-specific timing API.
    metricsStartNs?: bigint;
  }
}

// D19 sub-part (2): identical requireAuth factory to every other service
// (services/auth, services/portfolio, etc.) -- same JWT, same
// verifyAccessToken/InvalidTokenError contract. Applies only to the 20
// in-process routes below; the five proxied targets are never
// re-authenticated here (D19 (2) -- avoids a second, possibly-divergent
// auth check in front of a service that already runs its own).
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

// D19 sub-part (10): default Node process metrics plus one custom Counter
// and one custom Histogram, exposed on GET /metrics in Prometheus text
// format. One Registry per process, module-scoped rather than per-buildApp-
// call, since prom-client's default metrics registration is itself
// process-global (a second buildApp() call in the same process, e.g. in
// tests, would otherwise throw "metric already registered").
const metricsRegistry = new client.Registry();
client.collectDefaultMetrics({ register: metricsRegistry });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests handled by the gateway',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds, as observed by the gateway',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

// D19 sub-part (3): every proxied target's own /health mapped to its
// camelCase key in the fan-out response (openapi.yaml's
// GET /health/services schema). market-data is the only one of the five
// with its own /health route (services/*/src/app.ts, confirmed by grep) --
// the other four 404 on it. Per the proposed fix logged as Decision D21
// below: ANY HTTP response, including a 404, proves the target process is
// up and answering requests, so it counts as 'ok'; only a network-level
// failure (connection refused, DNS, timeout -- fetch() rejecting) means the
// service is actually unreachable. This makes the fan-out a true liveness
// check across all five services today without waiting on the other four
// to grow their own /health route.
const PROXY_NAME_TO_HEALTH_KEY: Record<string, string> = {
  auth: 'auth',
  'market-data': 'marketData',
  education: 'education',
  portfolio: 'portfolio',
  analytics: 'analytics',
};

// The only place this gateway builds its HTTP surface -- index.ts supplies
// real dependencies (proxy targets resolved from env, a real Redis client,
// Drizzle-backed repositories) and calls listen(). Tests supply in-memory
// fakes and call app.inject() instead, same pattern as every other
// service's buildApp/app.ts split.
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see services/auth/src/app.ts for why
    logger: deps.logger as any,
    genReqId: () => randomUUID(),
  });

  // D19 sub-part (4): registered globally, awaited before any route is
  // declared (services/auth/src/app.ts's own comment explains why awaiting
  // matters -- fastify/fastify-rate-limit#292). Redis-backed with
  // skipOnError left at its default `false` (fail closed), same reasoning
  // as every other rate-limited service in this repo. Keyed by
  // GATEWAY_RATE_LIMIT_PER_MIN, never RATE_LIMIT_PER_MIN (reserved for
  // services/auth's own limiter per .env.example's comment and D19 (4)).
  await app.register(rateLimit, {
    global: true,
    max: deps.rateLimit.max,
    timeWindow: deps.rateLimit.timeWindowMs,
    redis: deps.redis,
    nameSpace: 'tradosphere-gateway-rl-',
  });

  // Task 9.12: records one observation per completed request, tagged by
  // method/route/status. request.routerPath is only populated once Fastify
  // has matched a route (available by onResponse); it stays undefined for
  // a request that 404s before matching anything, in which case
  // request.url is used instead so a bad path still shows up in metrics
  // rather than being silently dropped.
  app.addHook('onRequest', async (request) => {
    request.metricsStartNs = process.hrtime.bigint();
  });
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routerPath ?? request.url;
    const labels = { method: request.method, route, status_code: String(reply.statusCode) };
    httpRequestsTotal.inc(labels);
    const durationSeconds = request.metricsStartNs
      ? Number(process.hrtime.bigint() - request.metricsStartNs) / 1e9
      : 0;
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  });

  const authed = requireAuth(deps);

  // ---------------------------------------------------------------------
  // Infra routes (task 9.11/9.12, D19 sub-part 9) -- unversioned, no auth
  // (openapi.yaml: `security: []` on every one of these).
  // ---------------------------------------------------------------------

  app.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok' });
  });

  app.get('/health/services', async (_request, reply) => {
    const body: Record<string, 'ok' | 'unreachable'> = {};
    await Promise.all(
      deps.proxyTargets.map(async (target) => {
        const key = PROXY_NAME_TO_HEALTH_KEY[target.name] ?? target.name;
        try {
          // Any HTTP response counts as reachable -- see Decision D21 in the
          // comment above PROXY_NAME_TO_HEALTH_KEY. The path itself doesn't
          // matter (only market-data actually implements /health), so this
          // never inspects the response body or status code.
          await fetch(`${target.baseUrl}/health`);
          body[key] = 'ok';
        } catch {
          body[key] = 'unreachable';
        }
      }),
    );
    return reply.send(body);
  });

  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', metricsRegistry.contentType);
    return reply.send(await metricsRegistry.metrics());
  });

  // D19 sub-part (9): the committed, hand-authored openapi.yaml served as
  // static content -- never runtime-generated. Read from disk on every
  // request (not cached at boot) so an in-place edit to the file is
  // reflected without a restart; this route is infra, not a hot path, so
  // the extra disk read per request is not a concern.
  app.get('/openapi.yaml', async (_request, reply) => {
    const spec = readFileSync(join(__dirname, '..', 'openapi.yaml'), 'utf-8');
    reply.header('Content-Type', 'application/yaml');
    return reply.send(spec);
  });

  app.get('/documentation', async (_request, reply) => {
    reply.header('Content-Type', 'text/html');
    return reply.send(`<!DOCTYPE html>
<html>
  <head>
    <title>Tradosphere OS API</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({ url: '/openapi.yaml', dom_id: '#swagger-ui' });
      };
    </script>
  </body>
</html>`);
  });

  // ---------------------------------------------------------------------
  // Task 9.1: the five proxied services. Encapsulated per-target inside
  // registerProxy's own app.register() child scope (proxy.ts) so their raw-
  // buffer content-type parser never leaks into this app's JSON routes
  // below.
  // ---------------------------------------------------------------------
  for (const target of deps.proxyTargets) {
    registerProxy(app, target);
  }

  // ---------------------------------------------------------------------
  // Research routes (task 9.2) -- services/research's five Sprint-4
  // analysis modules, called directly (D19 (1): in-process, no HTTP
  // surface of its own to proxy to). Every route requires auth (D19 (2),
  // openapi.yaml's global `security: [bearerAuth]`).
  // ---------------------------------------------------------------------

  app.post('/v1/research/technical', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(analyzeTechnicalBodySchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(analyzeTechnical(validation.data.symbol, validation.data.bars));
  });

  app.post('/v1/research/options', { preHandler: authed }, async (request, reply) => {
    // The request body IS the OptionChainSnapshot itself (validation.ts's
    // own comment) -- no wrapper object to unwrap.
    const validation = validateBody(optionChainSnapshotBodySchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(analyzeOptionChain(validation.data));
  });

  app.get('/v1/research/fundamentals/:symbol', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(symbolParamSchema, request.params);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const row = await deps.fundamentalsRepository.getLatestBySymbol(validation.data.symbol);
    if (!row) {
      // Honest gap, not a fabricated result -- same ResearchGap contract
      // every other research module already uses when its required input
      // is missing.
      return reply.send({
        status: 'gap',
        reason: 'missing_fundamentals',
        detail: `no fundamentals have been ingested for ${validation.data.symbol}`,
      });
    }
    // CompanyFundamentalsRow is a structural superset of CompanyFinancials
    // (same field names plus id/ingestedAt) -- analyzeFundamentals only
    // reads the fields it declares, so passing the row directly needs no
    // intermediate mapping step.
    return reply.send(analyzeFundamentals(validation.data.symbol, row));
  });

  app.post('/v1/research/sector', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(analyzeSectorBodySchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const { sector, sectorBars, benchmarkBars, rotationThresholdPct } = validation.data;
    return reply.send(
      rotationThresholdPct === undefined
        ? analyzeSector(sector, sectorBars, benchmarkBars)
        : analyzeSector(sector, sectorBars, benchmarkBars, rotationThresholdPct),
    );
  });

  app.post('/v1/research/quant', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(analyzeQuantBodySchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const { symbol, bars, period } = validation.data;
    return reply.send(period === undefined ? analyzeQuant(symbol, bars) : analyzeQuant(symbol, bars, period));
  });

  // ---------------------------------------------------------------------
  // AI Council routes (task 9.2) -- one per services/ai expert agent (5.2),
  // every call going through runAgent() (agent.ts) so no opinion ever
  // bypasses the shared schema, exactly as every direct in-package caller
  // does today.
  // ---------------------------------------------------------------------

  app.post('/v1/ai/agents/technical', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(technicalAnalysisResultSchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(runAgent(new TechnicalAgent(), validation.data));
  });

  app.post('/v1/ai/agents/options', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(optionAnalysisResultSchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(runAgent(new OptionsAgent(), validation.data));
  });

  app.post('/v1/ai/agents/sector', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(sectorAnalysisResultSchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(runAgent(new SectorAgent(), validation.data));
  });

  app.post('/v1/ai/agents/quant', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(quantAnalysisResultSchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(runAgent(new QuantAgent(), validation.data));
  });

  app.post('/v1/ai/agents/fundamental', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(fundamentalAnalysisResultSchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(runAgent(new FundamentalAgent(), validation.data));
  });

  app.post('/v1/ai/agents/indices', { preHandler: authed }, async (request, reply) => {
    // Decision D7: no dedicated indices module/input type -- reuses
    // TechnicalAnalysisResult and IndicesAgent relabels the expert field.
    const validation = validateBody(technicalAnalysisResultSchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(runAgent(new IndicesAgent(), validation.data));
  });

  app.post('/v1/ai/agents/strategy', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(opinionsOnlyBodySchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(runAgent(new StrategyAgent(), validation.data));
  });

  app.post('/v1/ai/agents/risk', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(riskAgentBodySchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(runAgent(new RiskAgent(), validation.data));
  });

  app.post('/v1/ai/agents/education', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(opinionsOnlyBodySchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(runAgent(new EducationAgent(), validation.data));
  });

  // ---------------------------------------------------------------------
  // CIO route (task 9.2/9.14) -- services/cio's buildCioVerdict(), then
  // (task 9.14/D19 (5)) publish the computed verdict onto
  // CIO_VERDICTS_CHANNEL immediately after computing it, for the /stream
  // WebSocket layer (task 9.3/9.13) to broadcast tagged `type: 'cio.verdict'`.
  // Published even when the risk gate vetoed the trade (tradeIdeas: []) --
  // subscribers see every verdict computed, not just the ones that shipped
  // an idea.
  // ---------------------------------------------------------------------

  app.post('/v1/cio/verdict', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(buildCioVerdictBodySchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const verdict = buildCioVerdict(validation.data);
    await deps.eventBus.publish(CIO_VERDICTS_CHANNEL, verdict);
    return reply.send(verdict);
  });

  // ---------------------------------------------------------------------
  // Paper Trading route (task 9.2) -- services/paper-trading's placeOrder().
  // Nothing is persisted here (openapi.yaml's own description) -- a Fill
  // only becomes durable via POST /v1/journal/entries below (Decision D16).
  // ---------------------------------------------------------------------

  app.post('/v1/paper-trading/orders', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(placeOrderBodySchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    try {
      const fill = await placeOrder(validation.data, { priceSource: deps.priceSource, now: deps.now });
      return reply.send(fill);
    } catch (err) {
      if (err instanceof NoMarketDataError) {
        return reply.code(404).send({ error: err.message });
      }
      if (err instanceof InvalidOrderError) {
        // Belt-and-suspenders: placeOrderBodySchema already rejects a
        // malformed order at the gateway before execution.ts's own
        // validateOrder() ever runs, but this catch stays in place so a
        // future schema/business-rule drift is still a 400, not a 500.
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  // ---------------------------------------------------------------------
  // Journal routes (task 9.2) -- services/journal's DrizzleJournalRepository,
  // this gateway's first-ever HTTP surface for the service (D19 (1)).
  // userId is always request.authUser!.sub, never trusted from the request
  // body, even though createJournalEntryBodySchema's own userId field is
  // optional (services/journal's CreateJournalEntryInput allows an
  // unauthenticated/system-originated entry in tests) -- same "never let a
  // caller act as a different user" rule services/portfolio and
  // services/education already established.
  // ---------------------------------------------------------------------

  app.post('/v1/journal/entries', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(createJournalEntryBodySchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const entry = await deps.journalRepository.create({ ...validation.data, userId: request.authUser!.sub });
    return reply.code(201).send(entry);
  });

  app.get('/v1/journal/entries', { preHandler: authed }, async (request, reply) => {
    const entries = await deps.journalRepository.listByUser(request.authUser!.sub);
    return reply.send({ entries });
  });

  app.get('/v1/journal/entries/:id', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(idParamSchema, request.params);
    if (!validation.success) return reply.code(400).send(validation.failure);
    const entry = await deps.journalRepository.getById(validation.data.id);
    if (!entry) return reply.code(404).send({ error: `journal entry not found: ${validation.data.id}` });
    return reply.send(entry);
  });

  app.post('/v1/journal/entries/:id/outcome', { preHandler: authed }, async (request, reply) => {
    const paramValidation = validateBody(idParamSchema, request.params);
    if (!paramValidation.success) return reply.code(400).send(paramValidation.failure);
    const bodyValidation = validateBody(recordOutcomeBodySchema, request.body);
    if (!bodyValidation.success) return reply.code(400).send(bodyValidation.failure);
    try {
      const entry = await deps.journalRepository.recordOutcome(paramValidation.data.id, bodyValidation.data);
      return reply.send(entry);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      if (err instanceof AlreadyClosedError) {
        return reply.code(409).send({ error: err.message });
      }
      if (err instanceof InvalidOutcomeError) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  // Task 9.9: same fail-closed 429 special-case as every rate-limited
  // service's own setErrorHandler (services/auth, services/portfolio),
  // then a deliberately generic, no-internal-detail 500 for everything
  // else genuinely unexpected.
  app.setErrorHandler((err, request, reply) => {
    if (err.statusCode === 429) {
      return reply.code(429).send({ error: err.message });
    }
    request.log.error({ err }, 'unhandled error in gateway');
    return reply.code(500).send({ error: 'internal server error' });
  });

  return app;
}
