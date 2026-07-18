import { Pool } from 'pg';
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

  // Idempotent -- safe to run on every boot. This is what lets
  // `docker compose up` produce a working auth service against a fresh
  // Postgres with no manual migration step.
  logger.info('applying database migrations');
  await runMigrations(pool);
  logger.info('database migrations applied');

  const db = createDb(pool);

  const app = buildApp({
    userRepo: new DrizzleUserRepository(db),
    sessionRepo: new DrizzleSessionRepository(db),
    jwtSecret: requireEnv('JWT_SECRET'),
    logger,
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
