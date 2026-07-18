import { Pool } from 'pg';
import Redis from 'ioredis';
import { createLogger } from '@tradosphere/logger';
import { requireEnv, getEnvNumber } from '@tradosphere/config';
import { createDb, runMigrations } from '@tradosphere/database';
import { buildApp } from './app';
import { DrizzleUserRepository, DrizzleSessionRepository } from './repository';

async function main() {
  const logger = createLogger('auth-service');
  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

  pool.on('error', (err) => {
    // Idle client errors (e.g. connection dropped by the DB) must be
    // logged loudly, never swallowed -- an uncaught 'error' on a pg Pool
    // otherwise crashes the process with no context.
    logger.error({ err }, 'unexpected postgres pool error');
  });

  // Task D (Sprint 5.5): backs the Redis-backed rate limiter registered in
  // app.ts. Constructed the same inline way as the `Pool` above (no
  // wrapping factory, matching this file's existing style) -- see
  // packages/event-bus's createEventBus() for the equivalent pattern used
  // where a factory *is* warranted (two clients, one abstraction).
  const redis = new Redis(requireEnv('REDIS_URL'));

  redis.on('error', (err) => {
    // Same reasoning as the pg Pool's 'error' handler above: an uncaught
    // 'error' event on an ioredis client crashes the process with no
    // context otherwise.
    logger.error({ err }, 'unexpected redis connection error');
  });

  // Idempotent -- safe to run on every boot. This is what lets
  // `docker compose up` produce a working auth service against a fresh
  // Postgres with no manual migration step.
  logger.info('applying database migrations');
  await runMigrations(pool);
  logger.info('database migrations applied');

  const db = createDb(pool);

  const app = await buildApp({
    userRepo: new DrizzleUserRepository(db),
    sessionRepo: new DrizzleSessionRepository(db),
    jwtSecret: requireEnv('JWT_SECRET'),
    logger,
    redis,
    // RATE_LIMIT_PER_MIN already exists in .env.example (previously
    // unused) -- its name is the contract for the window: always 60s.
    rateLimit: { max: getEnvNumber('RATE_LIMIT_PER_MIN', 120), timeWindowMs: 60_000 },
  });

  const port = getEnvNumber('AUTH_SERVICE_PORT', 4001);
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  // Logger may not exist yet if requireEnv threw before createLogger ran --
  // fall back to console so a misconfigured env var is never a silent exit.
  // eslint-disable-next-line no-console
  console.error('auth-service failed to start:', err);
  process.exit(1);
});
