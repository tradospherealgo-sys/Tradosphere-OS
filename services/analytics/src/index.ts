import { Pool } from 'pg';
import { createLogger } from '@tradosphere/logger';
import { requireEnv, getEnvNumber } from '@tradosphere/config';
import { createDb, runMigrations } from '@tradosphere/database';
import { buildApp } from './app';
import { DatabaseJournalSource } from './journal-source';
import { DatabaseEquitySource } from './equity-source';
import { DrizzleAnalyticsRepository } from './analytics-repository';

async function main() {
  const logger = createLogger('analytics-service');
  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

  pool.on('error', (err) => {
    // Idle client errors (e.g. connection dropped by the DB) must be
    // logged loudly, never swallowed -- an uncaught 'error' on a pg Pool
    // otherwise crashes the process with no context. Same reasoning as
    // every other service's index.ts.
    logger.error({ err }, 'unexpected postgres pool error');
  });

  // Idempotent -- safe to run on every boot. This is what lets
  // `docker compose up` produce a working analytics service against a
  // fresh Postgres with no manual migration step, including the
  // analytics_reports table from Sprint 8 task 8.4.
  logger.info('applying database migrations');
  await runMigrations(pool);
  logger.info('database migrations applied');

  const db = createDb(pool);

  // DatabaseJournalSource/DatabaseEquitySource/DrizzleAnalyticsRepository
  // are the real adapters behind the JournalEntrySource/EquitySnapshotSource/
  // AnalyticsRepository ports (Decision D18) -- both read ports query
  // journal_entries/portfolio_snapshots directly via @tradosphere/database,
  // never importing services/journal or services/portfolio themselves
  // (same D9/D12/D17 one-directional service-isolation precedent every
  // other cross-service read in this codebase uses).
  const app = await buildApp({
    journalEntrySource: new DatabaseJournalSource(db),
    equitySnapshotSource: new DatabaseEquitySource(db),
    analyticsRepository: new DrizzleAnalyticsRepository(db),
    jwtSecret: requireEnv('JWT_SECRET'),
    logger,
  });

  const port = getEnvNumber('ANALYTICS_SERVICE_PORT', 4005);
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  // Logger may not exist yet if requireEnv threw before createLogger ran --
  // fall back to console so a misconfigured env var is never a silent exit.
  // eslint-disable-next-line no-console
  console.error('analytics-service failed to start:', err);
  process.exit(1);
});
