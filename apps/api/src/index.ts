import Redis from 'ioredis';
import { Pool } from 'pg';
import { createLogger } from '@tradosphere/logger';
import { requireEnv, getEnv, getEnvNumber } from '@tradosphere/config';
import { createDb, runMigrations } from '@tradosphere/database';
import { createEventBus } from '@tradosphere/event-bus';
import { DrizzleFundamentalsRepository } from '@tradosphere/service-research';
import { DatabasePriceSource } from '@tradosphere/service-paper-trading';
import { DrizzleJournalRepository } from '@tradosphere/service-journal';
import { buildApp } from './app';
import type { ProxyTarget } from './proxy';
import { GatewayStreamServer } from './websocket';

// Task 9.15: the gateway's real bootstrap -- mirrors every other service's
// index.ts (Pool/pool.on('error')/runMigrations/createDb/buildApp/listen,
// e.g. services/portfolio/src/index.ts) with the additions Decision D19
// actually needs: five ProxyTarget base URLs resolved from env, a real
// ioredis client for the rate limiter (D19 (4)), and createEventBus for the
// CIO-verdict publish side (D19 (5)/task 9.14). Replaces the Sprint 1 smoke-
// test stub this file used to be.

// D19 (1)/D20: auth, market-data, and education mount routes root-level in
// their own app.ts (app.post('/signup', ...)), so stripPrefix equals the
// full `/v1/<service>` prefix -- stripping that leaves exactly the
// service's own root-level path. portfolio and analytics already
// self-prefix every route (app.get('/portfolio/positions', ...)), so
// stripPrefix is only `/v1` for those two -- stripping the service name too
// would double-strip and 404 every request (see proxy.ts's own header
// comment and Decision D20). Each *_SERVICE_URL is new (task 9.15) and
// falls back to the already-established localhost:<port> default so local,
// non-Docker dev needs zero new env vars; docker-compose.yml sets the real
// ones to the compose-network service hostnames.
function buildProxyTargets(): ProxyTarget[] {
  return [
    {
      name: 'auth',
      prefix: '/v1/auth',
      stripPrefix: '/v1/auth',
      baseUrl: getEnv('AUTH_SERVICE_URL', `http://localhost:${getEnvNumber('AUTH_SERVICE_PORT', 4001)}`),
    },
    {
      name: 'market-data',
      prefix: '/v1/market-data',
      stripPrefix: '/v1/market-data',
      baseUrl: getEnv(
        'MARKET_DATA_SERVICE_URL',
        `http://localhost:${getEnvNumber('MARKET_DATA_SERVICE_PORT', 4002)}`,
      ),
    },
    {
      name: 'education',
      prefix: '/v1/education',
      stripPrefix: '/v1/education',
      baseUrl: getEnv(
        'EDUCATION_SERVICE_URL',
        `http://localhost:${getEnvNumber('EDUCATION_SERVICE_PORT', 4003)}`,
      ),
    },
    {
      name: 'portfolio',
      prefix: '/v1/portfolio',
      stripPrefix: '/v1',
      baseUrl: getEnv(
        'PORTFOLIO_SERVICE_URL',
        `http://localhost:${getEnvNumber('PORTFOLIO_SERVICE_PORT', 4004)}`,
      ),
    },
    {
      name: 'analytics',
      prefix: '/v1/analytics',
      stripPrefix: '/v1',
      baseUrl: getEnv(
        'ANALYTICS_SERVICE_URL',
        `http://localhost:${getEnvNumber('ANALYTICS_SERVICE_PORT', 4005)}`,
      ),
    },
  ];
}

async function main() {
  const logger = createLogger('api-gateway');
  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

  pool.on('error', (err) => {
    // Same reasoning as every other service's index.ts -- an uncaught
    // 'error' on a pg Pool otherwise crashes the process with no context.
    logger.error({ err }, 'unexpected postgres pool error');
  });

  // Idempotent -- safe to run on every boot. The gateway itself owns no
  // schema, but its in-process routes read company_fundamentals and
  // journal_entries directly through the same Drizzle repositories
  // research/journal already migrate, so running migrations here too keeps
  // `docker compose up` self-sufficient even if the gateway is the first
  // container to reach a fresh Postgres.
  logger.info('applying database migrations');
  await runMigrations(pool);
  logger.info('database migrations applied');

  const db = createDb(pool);

  const redisUrl = requireEnv('REDIS_URL');
  // Dedicated ioredis client for @fastify/rate-limit (D19 (4)) -- separate
  // from the EventBus's own internal Redis connections (createEventBus
  // manages its own pub/sub clients), same separation-of-concerns
  // services/auth's index.ts already follows for its own rate limiter.
  const redis = new Redis(redisUrl);
  redis.on('error', (err) => {
    logger.error({ err }, 'unexpected redis rate-limit client error');
  });

  // Shared across buildApp's own publish side (POST /v1/cio/verdict, task
  // 9.14) and the WS layer's subscribe side (GatewayStreamServer.attach,
  // task 9.3/9.13) -- one EventBus instance/connection pair for the whole
  // gateway process, not two.
  const eventBus = createEventBus(redisUrl);

  const app = await buildApp({
    proxyTargets: buildProxyTargets(),
    jwtSecret: requireEnv('JWT_SECRET'),
    logger,
    redis,
    rateLimit: {
      // Never RATE_LIMIT_PER_MIN -- .env.example's own comment reserves that
      // name for services/auth specifically, per Decision D19 (4).
      max: getEnvNumber('GATEWAY_RATE_LIMIT_PER_MIN', 300),
      timeWindowMs: 60_000,
    },
    eventBus,
    fundamentalsRepository: new DrizzleFundamentalsRepository(db),
    journalRepository: new DrizzleJournalRepository(db),
    priceSource: new DatabasePriceSource(db),
  });

  // Task 9.3/9.13: attach the WS layer to the same underlying http.Server
  // Fastify already owns (app.server exists as soon as Fastify() is
  // constructed inside buildApp, no need to wait for listen()) so /stream
  // upgrades are handled on the one port the gateway binds.
  const streamServer = new GatewayStreamServer(app.server);
  await streamServer.attach(eventBus);

  const port = getEnvNumber('API_PORT', 4000);
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  // Logger may not exist yet if requireEnv threw before createLogger ran --
  // fall back to console so a misconfigured env var is never a silent exit.
  // eslint-disable-next-line no-console
  console.error('api-gateway failed to start:', err);
  process.exit(1);
});
