import { Pool } from 'pg';
import { createLogger } from '@tradosphere/logger';
import { requireEnv, getEnv, getEnvNumber } from '@tradosphere/config';
import { createDb, runMigrations } from '@tradosphere/database';
import { createEventBus } from '@tradosphere/event-bus';
import { SimulatedBrokerClient } from '@tradosphere/broker-core';
import { buildApp } from './app';
import { DrizzleMarketDataRepository } from './repository';
import { startLiveIngestion } from './live-ingestion';
import { TickStreamServer } from './tick-stream-server';

async function main() {
  const logger = createLogger('market-data-service');
  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

  pool.on('error', (err) => {
    // Same posture as services/auth: an uncaught 'error' on a pg Pool must
    // never crash the process silently.
    logger.error({ err }, 'unexpected postgres pool error');
  });

  // Idempotent -- safe to run on every boot (same pattern as services/auth).
  logger.info('applying database migrations');
  await runMigrations(pool);
  logger.info('database migrations applied');

  const db = createDb(pool);
  const repo = new DrizzleMarketDataRepository(db);
  const eventBus = createEventBus(requireEnv('REDIS_URL'));

  // Sprint 3 Decision D5: SMC Global's broker API is not yet public, so live
  // ingestion runs against SimulatedBrokerClient -- a deterministic test/dev
  // double that is never presented to an end user as real market data.
  // Swapping in the real SmcGlobalBrokerClient later requires no change
  // beyond this constructor call, since both implement the same
  // BrokerClient port (packages/broker-core).
  const broker = new SimulatedBrokerClient();
  await broker.authenticate();

  const symbols = getEnv('MARKET_DATA_SYMBOLS', 'RELIANCE,TCS,INFY')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const app = buildApp({ logger });

  const tickStream = new TickStreamServer(app.server);
  await tickStream.attach(eventBus);

  const ingestion = startLiveIngestion(
    {
      broker,
      repo,
      eventBus,
      logger,
      onFatalError: (err) => {
        // Task 3.6: a feed outage is already logged loudly in
        // live-ingestion.ts. This hook exists for future alerting/metrics
        // wiring -- it must never substitute cached or fabricated ticks.
        logger.error({ err }, 'market-data service observed a fatal feed outage');
      },
    },
    symbols,
  );

  const port = getEnvNumber('MARKET_DATA_SERVICE_PORT', 4002);
  await app.listen({ port, host: '0.0.0.0' });
  logger.info({ port, symbols }, 'market-data service listening');

  const shutdown = async () => {
    ingestion.stop();
    await tickStream.close();
    await eventBus.close();
    await broker.disconnect();
    await app.close();
    await pool.end();
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err) => {
  // Logger may not exist yet if requireEnv threw before createLogger ran --
  // fall back to console so a misconfigured env var is never a silent exit.
  // eslint-disable-next-line no-console
  console.error('market-data-service failed to start:', err);
  process.exit(1);
});
