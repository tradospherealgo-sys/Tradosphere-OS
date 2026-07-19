process.env.LOG_LEVEL = 'silent'; // kept for parity with sibling suites; no pino instance in this file

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import type EmbeddedPostgres from 'embedded-postgres';
import { createDb, runMigrations, marketTicks, type Database } from '@tradosphere/database';
import { DatabasePriceSource } from '../src/price-source';
import { placeOrder, NoMarketDataError } from '../src/execution';

// Task 8.1's literal verification criterion: "fills use real market price,
// never fabricated." Unit tests (execution.test.ts) prove the engine is
// correct given whatever a PriceSource returns; this suite is what proves
// the *real* adapter (DatabasePriceSource) reads a genuine row out of
// Postgres's market_ticks table -- the same table services/market-data
// actually writes into in production -- rather than trusting the port's
// contract on faith.
//
// Port 55436 -- next free after services/education's repository.integration
// (55435), auth's fullstack.integration (55434) and repository.integration
// (55433). Give any future suite that also boots embedded-postgres its own
// next-free port rather than reusing this one.
const TEST_PORT = 55436;

let embeddedPg: EmbeddedPostgres | undefined;
let pool: Pool | undefined;
let db: Database | undefined;
let dataDir: string | undefined;
let postgresAvailable = false;
let priceSource: DatabasePriceSource;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'tradosphere-paper-trading-pg-'));

  try {
    // Dynamic import -- embedded-postgres is ESM-only; see
    // services/auth/test/repository.integration.test.ts for the full
    // ERR_REQUIRE_ESM writeup this pattern originates from.
    const { default: EmbeddedPostgresCtor } = await import('embedded-postgres');

    embeddedPg = new EmbeddedPostgresCtor({
      databaseDir: dataDir,
      user: 'tradosphere_test',
      password: 'test-password-not-for-prod',
      port: TEST_PORT,
      persistent: false,
      onLog: () => {}, // Postgres's own boot log is noisy; real failures still throw and are caught below.
    });
    await embeddedPg.initialise();
    await embeddedPg.start();
    await embeddedPg.createDatabase('tradosphere_paper_trading_test');

    pool = new Pool({
      host: 'localhost',
      port: TEST_PORT,
      user: 'tradosphere_test',
      password: 'test-password-not-for-prod',
      database: 'tradosphere_paper_trading_test',
    });
    pool.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('unexpected postgres pool error in price-source.integration.test', err);
    });

    // The real migration set -- proves market-data-schema.ts's market_ticks
    // table is exactly what DatabasePriceSource reads from in production.
    await runMigrations(pool);
    db = createDb(pool);
    priceSource = new DatabasePriceSource(db);
    postgresAvailable = true;
  } catch (err) {
    // Environment-blocked, not a code failure -- every test below checks
    // `postgresAvailable` and skips itself rather than failing on an
    // infrastructure gap (same pattern as auth's and education's equivalent
    // suites).
    // eslint-disable-next-line no-console
    console.error(
      'embedded-postgres unavailable in this environment; price-source.integration suite will skip',
      err,
    );
    postgresAvailable = false;
  }
}, 30_000);

afterAll(async () => {
  await pool?.end();
  await embeddedPg?.stop();
  if (dataDir) {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

beforeEach(async () => {
  if (!postgresAvailable || !pool) return;
  await pool.query('TRUNCATE TABLE market_ticks RESTART IDENTITY CASCADE');
});

describe('DatabasePriceSource (real Postgres)', () => {
  it('getLatestPrice() returns the most recent real tick for a symbol, by tick time not insert order', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    // Inserted out of chronological order on purpose -- getLatestPrice()
    // must sort by the tick's own tickTimestamp, not by insertion order.
    await db.insert(marketTicks).values([
      { symbol: 'RELIANCE', price: 2512.5, volume: 1200, tickTimestamp: new Date('2026-07-18T09:16:00Z') },
      { symbol: 'RELIANCE', price: 2500, volume: 1000, tickTimestamp: new Date('2026-07-18T09:15:00Z') },
    ]);

    const result = await priceSource.getLatestPrice('RELIANCE');
    expect(result?.price).toBe(2512.5);
    expect(result?.asOfIso).toBe('2026-07-18T09:16:00.000Z');
  });

  it('getLatestPrice() returns undefined for a symbol with no ticks -- never fabricates one', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    expect(await priceSource.getLatestPrice('UNKNOWN')).toBeUndefined();
  });

  it('getLatestPrice() only returns ticks for the requested symbol, never a different one', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    await db.insert(marketTicks).values([
      { symbol: 'TCS', price: 4123.45, volume: 500, tickTimestamp: new Date('2026-07-18T10:00:00Z') },
      { symbol: 'INFY', price: 1800, volume: 700, tickTimestamp: new Date('2026-07-18T10:05:00Z') },
    ]);

    const result = await priceSource.getLatestPrice('TCS');
    expect(result?.symbol).toBe('TCS');
    expect(result?.price).toBe(4123.45);
  });
});

describe('placeOrder() against real Postgres market data (Sprint 8 task 8.1 verification)', () => {
  it('fills at exactly the real seeded tick price -- proves the fill is not fabricated', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    await db
      .insert(marketTicks)
      .values({ symbol: 'TCS', price: 4123.45, volume: 500, tickTimestamp: new Date('2026-07-18T10:00:00Z') });

    const fill = await placeOrder({ symbol: 'TCS', side: 'buy', quantity: 10 }, { priceSource });

    expect(fill.price).toBe(4123.45);
    expect(fill.priceAsOfIso).toBe('2026-07-18T10:00:00.000Z');
    expect(fill.quantity).toBe(10);
    expect(fill.symbol).toBe('TCS');
  });

  it('rejects an order for a symbol with no real market data instead of fabricating a fill', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    await expect(
      placeOrder({ symbol: 'NOSUCHSYMBOL', side: 'buy', quantity: 1 }, { priceSource }),
    ).rejects.toThrow(NoMarketDataError);
  });

  it('picks up a newly-arrived tick on the next order -- always the latest real price, not a cached one', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    await db
      .insert(marketTicks)
      .values({ symbol: 'RELIANCE', price: 2500, volume: 1000, tickTimestamp: new Date('2026-07-18T09:00:00Z') });
    const first = await placeOrder({ symbol: 'RELIANCE', side: 'buy', quantity: 1 }, { priceSource });
    expect(first.price).toBe(2500);

    await db
      .insert(marketTicks)
      .values({ symbol: 'RELIANCE', price: 2530.75, volume: 900, tickTimestamp: new Date('2026-07-18T09:05:00Z') });
    const second = await placeOrder({ symbol: 'RELIANCE', side: 'sell', quantity: 1 }, { priceSource });
    expect(second.price).toBe(2530.75);
  });
});
