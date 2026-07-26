process.env.LOG_LEVEL = 'silent'; // kept for parity with sibling suites; no pino instance in this file

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import type EmbeddedPostgres from 'embedded-postgres';
import { createDb, runMigrations, users, type Database } from '@tradosphere/database';
import { DrizzleAnalyticsRepository, type CreateReportInput } from '../src/analytics-repository';

// Task 8.4's own exit criterion needs the real adapter proven against real
// Postgres, not just the port (the 12 test/*.test.ts unit suites already
// prove the business rules in isolation, and test/fakes.ts's
// InMemoryAnalyticsRepository already proves app.ts's routes against a fake).
// This suite proves DrizzleAnalyticsRepository round-trips a genuine row
// through analytics_reports -- including the one behavior no in-memory fake
// can reproduce: the real userId FK's ON DELETE SET NULL action
// (analytics-schema.ts / Decision D18, same reasoning portfolio-schema.ts and
// journal-schema.ts already established).
//
// Port 55440 -- next free after services/portfolio's repository.integration
// (55438), services/education's seed.integration (55439), services/journal's
// repository.integration (55437), services/paper-trading's
// price-source.integration (55436), services/education's
// repository.integration (55435), and auth's fullstack.integration (55434) /
// repository.integration (55433). Give any future suite that also boots
// embedded-postgres its own next-free port rather than reusing this one.
const TEST_PORT = 55440;

let embeddedPg: EmbeddedPostgres | undefined;
let pool: Pool | undefined;
let db: Database | undefined;
let dataDir: string | undefined;
let postgresAvailable = false;
let repo: DrizzleAnalyticsRepository;

// Every field the real table requires -- ratios/label/period bounds/userId
// are left to each test's overrides so each case can exercise the exact
// nullable-vs-populated column it cares about.
function fullReportInput(overrides: Partial<CreateReportInput> = {}): CreateReportInput {
  return {
    totalTrades: 10,
    winningTrades: 6,
    losingTrades: 3,
    breakevenTrades: 1,
    openTrades: 2,
    totalRealizedPnl: 450,
    winRate: 0.6,
    averageReturn: 45,
    averageReturnPct: 0.045,
    expectancy: 30,
    plannedRiskRewardRatio: 2.5,
    realizedRiskRewardRatio: 1.8,
    maxDrawdownPct: 0.12,
    sharpeRatio: 1.1,
    sortinoRatio: 1.4,
    asOfIso: '2026-07-18T21:00:00.000Z',
    ...overrides,
  };
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'tradosphere-analytics-pg-'));

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
    await embeddedPg.createDatabase('tradosphere_analytics_test');

    pool = new Pool({
      host: 'localhost',
      port: TEST_PORT,
      user: 'tradosphere_test',
      password: 'test-password-not-for-prod',
      database: 'tradosphere_analytics_test',
    });
    pool.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('unexpected postgres pool error in repository.integration.test', err);
    });

    // The real migration set -- proves analytics-schema.ts's
    // analytics_reports table is exactly what DrizzleAnalyticsRepository
    // reads and writes in production.
    await runMigrations(pool);
    db = createDb(pool);
    repo = new DrizzleAnalyticsRepository(db);
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
  await pool.query('TRUNCATE TABLE analytics_reports, users RESTART IDENTITY CASCADE');
});

describe('DrizzleAnalyticsRepository.create (real Postgres)', () => {
  it('persists a full report, readable back via listByUser()', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [user] = await db
      .insert(users)
      .values({ email: 'trader@tradosphere.os', passwordHash: 'hashed:x' })
      .returning();

    const created = await repo.create(
      fullReportInput({ userId: user.id, label: 'monthly-2026-01' }),
    );

    expect(created.id).toBeDefined();
    expect(created.userId).toBe(user.id);
    expect(created.totalTrades).toBe(10);

    const [fetched] = await repo.listByUser(user.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.label).toBe('monthly-2026-01');
    expect(fetched.totalTrades).toBe(10);
    expect(fetched.winningTrades).toBe(6);
    expect(fetched.losingTrades).toBe(3);
    expect(fetched.breakevenTrades).toBe(1);
    expect(fetched.openTrades).toBe(2);
    expect(fetched.totalRealizedPnl).toBe(450);
    expect(fetched.winRate).toBe(0.6);
    expect(fetched.averageReturn).toBe(45);
    expect(fetched.averageReturnPct).toBe(0.045);
    expect(fetched.expectancy).toBe(30);
    expect(fetched.plannedRiskRewardRatio).toBe(2.5);
    expect(fetched.realizedRiskRewardRatio).toBe(1.8);
    expect(fetched.maxDrawdownPct).toBe(0.12);
    expect(fetched.sharpeRatio).toBe(1.1);
    expect(fetched.sortinoRatio).toBe(1.4);
    expect(fetched.asOf.toISOString()).toBe('2026-07-18T21:00:00.000Z');
  });

  it('leaves label/fromDate/toDate NULL in real Postgres when the caller omits them', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [user] = await db.insert(users).values({ email: 'nolabel@tradosphere.os', passwordHash: 'x' }).returning();
    await repo.create(fullReportInput({ userId: user.id }));

    const [fetched] = await repo.listByUser(user.id);
    expect(fetched.label).toBeNull();
    expect(fetched.fromDate).toBeNull();
    expect(fetched.toDate).toBeNull();
  });

  it('allows userId to be omitted entirely, persisting a NULL owner', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const created = await repo.create(fullReportInput());

    expect(created.userId).toBeNull();
  });

  it('persists genuinely undefined ratios as real NULLs, never a fabricated 0 (Delta charter rule 5)', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [user] = await db.insert(users).values({ email: 'nodata@tradosphere.os', passwordHash: 'x' }).returning();
    await repo.create(
      fullReportInput({
        userId: user.id,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        breakevenTrades: 0,
        openTrades: 0,
        totalRealizedPnl: 0,
        winRate: null,
        averageReturn: null,
        averageReturnPct: null,
        expectancy: null,
        plannedRiskRewardRatio: null,
        realizedRiskRewardRatio: null,
        maxDrawdownPct: null,
        sharpeRatio: null,
        sortinoRatio: null,
      }),
    );

    const [fetched] = await repo.listByUser(user.id);
    // The true zeros (counts, realized P&L sum) survive as zero...
    expect(fetched.totalTrades).toBe(0);
    expect(fetched.totalRealizedPnl).toBe(0);
    // ...while every ratio that has no data behind it stays NULL, not 0.
    expect(fetched.winRate).toBeNull();
    expect(fetched.averageReturn).toBeNull();
    expect(fetched.averageReturnPct).toBeNull();
    expect(fetched.expectancy).toBeNull();
    expect(fetched.plannedRiskRewardRatio).toBeNull();
    expect(fetched.realizedRiskRewardRatio).toBeNull();
    expect(fetched.maxDrawdownPct).toBeNull();
    expect(fetched.sharpeRatio).toBeNull();
    expect(fetched.sortinoRatio).toBeNull();
  });

  it('persists fromDate/toDate when both bounds of a custom period are supplied', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [user] = await db.insert(users).values({ email: 'bounded@tradosphere.os', passwordHash: 'x' }).returning();
    await repo.create(
      fullReportInput({
        userId: user.id,
        fromIso: '2026-01-01T00:00:00.000Z',
        toIso: '2026-01-31T23:59:59.000Z',
      }),
    );

    const [fetched] = await repo.listByUser(user.id);
    expect(fetched.fromDate?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(fetched.toDate?.toISOString()).toBe('2026-01-31T23:59:59.000Z');
  });
});

describe('DrizzleAnalyticsRepository.listByUser (real Postgres)', () => {
  it('only returns reports belonging to that real user', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [userA] = await db.insert(users).values({ email: 'a@tradosphere.os', passwordHash: 'x' }).returning();
    const [userB] = await db.insert(users).values({ email: 'b@tradosphere.os', passwordHash: 'x' }).returning();

    await repo.create(fullReportInput({ userId: userA.id }));
    await repo.create(fullReportInput({ userId: userB.id }));
    await repo.create(fullReportInput({ userId: userA.id, asOfIso: '2026-07-19T21:00:00.000Z' }));

    const rows = await repo.listByUser(userA.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.userId === userA.id)).toBe(true);
  });

  it('orders results descending by asOf -- newest report first, the opposite of the Equity Curve\'s ascending order', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [user] = await db.insert(users).values({ email: 'ordered@tradosphere.os', passwordHash: 'x' }).returning();
    // Inserted deliberately out of chronological order.
    await repo.create(fullReportInput({ userId: user.id, asOfIso: '2026-07-18T21:00:00.000Z' }));
    await repo.create(fullReportInput({ userId: user.id, asOfIso: '2026-07-16T21:00:00.000Z' }));
    await repo.create(fullReportInput({ userId: user.id, asOfIso: '2026-07-17T21:00:00.000Z' }));

    const rows = await repo.listByUser(user.id);
    expect(rows.map((row) => row.asOf.toISOString())).toEqual([
      '2026-07-18T21:00:00.000Z',
      '2026-07-17T21:00:00.000Z',
      '2026-07-16T21:00:00.000Z',
    ]);
  });

  it('applies fromIso/toIso as inclusive bounds', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [user] = await db.insert(users).values({ email: 'filtered@tradosphere.os', passwordHash: 'x' }).returning();
    await repo.create(fullReportInput({ userId: user.id, asOfIso: '2026-07-16T21:00:00.000Z' }));
    await repo.create(fullReportInput({ userId: user.id, asOfIso: '2026-07-17T21:00:00.000Z' }));
    await repo.create(fullReportInput({ userId: user.id, asOfIso: '2026-07-18T21:00:00.000Z' }));

    const rows = await repo.listByUser(user.id, {
      fromIso: '2026-07-17T00:00:00.000Z',
      toIso: '2026-07-17T23:59:59.000Z',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].asOf.toISOString()).toBe('2026-07-17T21:00:00.000Z');
  });
});

describe('DrizzleAnalyticsRepository.getById (real Postgres)', () => {
  it('returns the report when the id belongs to that user', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [user] = await db.insert(users).values({ email: 'owner@tradosphere.os', passwordHash: 'x' }).returning();
    const created = await repo.create(fullReportInput({ userId: user.id, label: 'mine' }));

    const fetched = await repo.getById(created.id, user.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.label).toBe('mine');
  });

  it('returns null when the id exists but belongs to a different user -- indistinguishable from not found (errors.ts)', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [owner] = await db.insert(users).values({ email: 'owner2@tradosphere.os', passwordHash: 'x' }).returning();
    const [intruder] = await db.insert(users).values({ email: 'intruder@tradosphere.os', passwordHash: 'x' }).returning();
    const created = await repo.create(fullReportInput({ userId: owner.id }));

    const fetched = await repo.getById(created.id, intruder.id);
    expect(fetched).toBeNull();
  });

  it('returns null when the id does not exist at all', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [user] = await db.insert(users).values({ email: 'nobody@tradosphere.os', passwordHash: 'x' }).returning();
    const fetched = await repo.getById('00000000-0000-0000-0000-000000000000', user.id);
    expect(fetched).toBeNull();
  });
});

describe('analytics_reports.user_id FK behavior (real Postgres, Decision D18)', () => {
  it('ON DELETE SET NULL: deleting the user leaves the report intact with user_id now NULL', async (ctx) => {
    if (!postgresAvailable || !db || !pool) return ctx.skip();

    const [user] = await db
      .insert(users)
      .values({ email: 'deleteme@tradosphere.os', passwordHash: 'x' })
      .returning();
    const created = await repo.create(fullReportInput({ userId: user.id, label: 'monthly-2026-01' }));

    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);

    // Same reasoning portfolio_snapshots.user_id / journal_entries.user_id
    // already established: an analytics report is a historical record of
    // what was reported, not user-owned content -- deleting the trader's
    // account must never delete (or block deleting, via a RESTRICT) their
    // report history.
    const [survived] = await pool.query('SELECT * FROM analytics_reports WHERE id = $1', [created.id]).then(
      (result) => result.rows,
    );
    expect(survived).toBeDefined();
    expect(survived.user_id).toBeNull();
    expect(Number(survived.total_realized_pnl)).toBe(450);
    expect(survived.label).toBe('monthly-2026-01');
  });
});
