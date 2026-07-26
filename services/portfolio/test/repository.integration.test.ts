process.env.LOG_LEVEL = 'silent'; // kept for parity with sibling suites; no pino instance in this file

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import type EmbeddedPostgres from 'embedded-postgres';
import { createDb, runMigrations, users, type Database } from '@tradosphere/database';
import { DrizzlePortfolioRepository } from '../src/portfolio-repository';

// Task 8.3's own exit criterion needs the real adapter proven against real
// Postgres, not just the port (test/mtm.test.ts + test/fakes.ts already
// prove the business rules against InMemoryPortfolioRepository). This suite
// proves DrizzlePortfolioRepository round-trips a genuine row through
// portfolio_snapshots -- including the one behavior no in-memory fake can
// reproduce: the real userId FK's ON DELETE SET NULL action
// (portfolio-schema.ts / Decision D17, same reasoning journal-schema.ts's
// user_id column already established).
//
// Port 55438 -- next free after services/journal's repository.integration
// (55437), services/paper-trading's price-source.integration /
// services/education's seed.integration (55436), services/education's
// repository.integration (55435), and auth's fullstack.integration (55434) /
// repository.integration (55433). Give any future suite that also boots
// embedded-postgres its own next-free port rather than reusing this one.
const TEST_PORT = 55438;

let embeddedPg: EmbeddedPostgres | undefined;
let pool: Pool | undefined;
let db: Database | undefined;
let dataDir: string | undefined;
let postgresAvailable = false;
let repo: DrizzlePortfolioRepository;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'tradosphere-portfolio-pg-'));

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
    await embeddedPg.createDatabase('tradosphere_portfolio_test');

    pool = new Pool({
      host: 'localhost',
      port: TEST_PORT,
      user: 'tradosphere_test',
      password: 'test-password-not-for-prod',
      database: 'tradosphere_portfolio_test',
    });
    pool.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('unexpected postgres pool error in repository.integration.test', err);
    });

    // The real migration set -- proves portfolio-schema.ts's
    // portfolio_snapshots table is exactly what DrizzlePortfolioRepository
    // reads and writes in production.
    await runMigrations(pool);
    db = createDb(pool);
    repo = new DrizzlePortfolioRepository(db);
    postgresAvailable = true;
  } catch (err) {
    // Environment-blocked, not a code failure -- every test below checks
    // `postgresAvailable` and skips itself rather than failing on an
    // infrastructure gap (same pattern as every sibling integration suite).
    // eslint-disable-next-line no-console
    console.error(
      'embedded-postgres unavailable in this environment; repository.integration suite will skip',
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
  await pool.query('TRUNCATE TABLE portfolio_snapshots, users RESTART IDENTITY CASCADE');
});

describe('DrizzlePortfolioRepository.create (real Postgres)', () => {
  it('persists a full snapshot, readable back via listByUser()', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [user] = await db
      .insert(users)
      .values({ email: 'trader@tradosphere.os', passwordHash: 'hashed:x' })
      .returning();

    const created = await repo.create({
      userId: user.id,
      cashBalance: 98_500,
      positionsValue: 1_500,
      realizedPnl: 300,
      unrealizedPnl: 200,
      totalEquity: 100_500,
      label: 'daily-mtm',
      asOfIso: '2026-07-18T21:00:00.000Z',
    });

    expect(created.id).toBeDefined();
    expect(created.userId).toBe(user.id);
    expect(created.totalEquity).toBe(100_500);

    const [fetched] = await repo.listByUser(user.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.cashBalance).toBe(98_500);
    expect(fetched.positionsValue).toBe(1_500);
    expect(fetched.realizedPnl).toBe(300);
    expect(fetched.unrealizedPnl).toBe(200);
    expect(fetched.totalEquity).toBe(100_500);
    expect(fetched.label).toBe('daily-mtm');
    expect(fetched.asOf.toISOString()).toBe('2026-07-18T21:00:00.000Z');
  });

  it('leaves label NULL in real Postgres when the caller omits it', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [user] = await db.insert(users).values({ email: 'nolabel@tradosphere.os', passwordHash: 'x' }).returning();
    await repo.create({
      userId: user.id,
      cashBalance: 100_000,
      positionsValue: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalEquity: 100_000,
      asOfIso: '2026-07-18T21:00:00.000Z',
    });

    const [fetched] = await repo.listByUser(user.id);
    expect(fetched.label).toBeNull();
  });

  it('allows userId to be omitted entirely, persisting a NULL owner', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const created = await repo.create({
      cashBalance: 100_000,
      positionsValue: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalEquity: 100_000,
      asOfIso: '2026-07-18T21:00:00.000Z',
    });

    expect(created.userId).toBeNull();
  });
});

describe('DrizzlePortfolioRepository.listByUser (real Postgres)', () => {
  it('only returns snapshots belonging to that real user', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [userA] = await db.insert(users).values({ email: 'a@tradosphere.os', passwordHash: 'x' }).returning();
    const [userB] = await db.insert(users).values({ email: 'b@tradosphere.os', passwordHash: 'x' }).returning();

    const snapshot = {
      cashBalance: 100_000,
      positionsValue: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalEquity: 100_000,
      asOfIso: '2026-07-18T21:00:00.000Z',
    };
    await repo.create({ ...snapshot, userId: userA.id });
    await repo.create({ ...snapshot, userId: userB.id });
    await repo.create({ ...snapshot, userId: userA.id, asOfIso: '2026-07-19T21:00:00.000Z' });

    const rows = await repo.listByUser(userA.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.userId === userA.id)).toBe(true);
  });

  it('orders results ascending by asOf, serving both the Equity Curve and Portfolio History from one query', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [user] = await db.insert(users).values({ email: 'ordered@tradosphere.os', passwordHash: 'x' }).returning();
    const base = {
      userId: user.id,
      cashBalance: 100_000,
      positionsValue: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalEquity: 100_000,
    };
    // Inserted deliberately out of chronological order.
    await repo.create({ ...base, asOfIso: '2026-07-18T21:00:00.000Z' });
    await repo.create({ ...base, asOfIso: '2026-07-16T21:00:00.000Z' });
    await repo.create({ ...base, asOfIso: '2026-07-17T21:00:00.000Z' });

    const rows = await repo.listByUser(user.id);
    expect(rows.map((row) => row.asOf.toISOString())).toEqual([
      '2026-07-16T21:00:00.000Z',
      '2026-07-17T21:00:00.000Z',
      '2026-07-18T21:00:00.000Z',
    ]);
  });

  it('applies fromIso/toIso as inclusive bounds', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [user] = await db.insert(users).values({ email: 'bounded@tradosphere.os', passwordHash: 'x' }).returning();
    const base = {
      userId: user.id,
      cashBalance: 100_000,
      positionsValue: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalEquity: 100_000,
    };
    await repo.create({ ...base, asOfIso: '2026-07-16T21:00:00.000Z' });
    await repo.create({ ...base, asOfIso: '2026-07-17T21:00:00.000Z' });
    await repo.create({ ...base, asOfIso: '2026-07-18T21:00:00.000Z' });

    const rows = await repo.listByUser(user.id, {
      fromIso: '2026-07-17T00:00:00.000Z',
      toIso: '2026-07-17T23:59:59.000Z',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].asOf.toISOString()).toBe('2026-07-17T21:00:00.000Z');
  });
});

describe('portfolio_snapshots.user_id FK behavior (real Postgres, Decision D17)', () => {
  it('ON DELETE SET NULL: deleting the user leaves the snapshot intact with user_id now NULL', async (ctx) => {
    if (!postgresAvailable || !db || !pool) return ctx.skip();

    const [user] = await db
      .insert(users)
      .values({ email: 'deleteme@tradosphere.os', passwordHash: 'x' })
      .returning();
    const created = await repo.create({
      userId: user.id,
      cashBalance: 100_000,
      positionsValue: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalEquity: 100_000,
      label: 'daily-mtm',
      asOfIso: '2026-07-18T21:00:00.000Z',
    });

    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);

    // Same reasoning journal_entries.user_id already established: a
    // portfolio snapshot is a historical record of account state, not
    // user-owned content -- deleting the trader's account must never delete
    // (or block deleting, via a RESTRICT) their equity history.
    const [survived] = await pool.query('SELECT * FROM portfolio_snapshots WHERE id = $1', [created.id]).then(
      (result) => result.rows,
    );
    expect(survived).toBeDefined();
    expect(survived.user_id).toBeNull();
    expect(Number(survived.total_equity)).toBe(100_000);
    expect(survived.label).toBe('daily-mtm');
  });
});
