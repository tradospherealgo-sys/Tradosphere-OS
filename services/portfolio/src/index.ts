import { Pool } from 'pg';
import { createLogger } from '@tradosphere/logger';
import { requireEnv, getEnvNumber } from '@tradosphere/config';
import { createDb, runMigrations } from '@tradosphere/database';
import { buildApp } from './app';
import { JournalTradeRecordSource } from './trade-record-source';
import { DatabasePriceSource } from './price-source';
import { DrizzlePortfolioRepository } from './portfolio-repository';
import { DEFAULT_STARTING_CASH } from './cash';

async function main() {
  const logger = createLogger('portfolio-service');
  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

  pool.on('error', (err) => {
    // Idle client errors (e.g. connection dropped by the DB) must be
    // logged loudly, never swallowed -- an uncaught 'error' on a pg Pool
    // otherwise crashes the process with no context. Same reasoning as
    // every other service's index.ts.
    logger.error({ err }, 'unexpected postgres pool error');
  });

  // Idempotent -- safe to run on every boot. This is what lets
  // `docker compose up` produce a working portfolio service against a
  // fresh Postgres with no manual migration step, including the
  // portfolio_snapshots table from Sprint 8 task 8.3.
  logger.info('applying database migrations');
  await runMigrations(pool);
  logger.info('database migrations applied');

  const db = createDb(pool);

  // JournalTradeRecordSource/DatabasePriceSource/DrizzlePortfolioRepository
  // are the real adapters behind the TradeRecordSource/PriceSource/
  // PortfolioRepository ports (Decision D17) -- swapping any one of them
  // for a live-broker-backed adapter later never touches app.ts or
  // positions.ts/cash.ts/pnl.ts/mtm.ts, per the Principal's explicit
  // interfaces-for-later-broker-sync instruction for this sprint.
  const app = await buildApp({
    tradeRecordSource: new JournalTradeRecordSource(db),
    priceSource: new DatabasePriceSource(db),
    portfolioRepository: new DrizzlePortfolioRepository(db),
    startingCash: DEFAULT_STARTING_CASH,
    jwtSecret: requireEnv('JWT_SECRET'),
    logger,
  });

  const port = getEnvNumber('PORTFOLIO_SERVICE_PORT', 4004);
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  // Logger may not exist yet if requireEnv threw before createLogger ran --
  // fall back to console so a misconfigured env var is never a silent exit.
  // eslint-disable-next-line no-console
  console.error('portfolio-service failed to start:', err);
  process.exit(1);
});
