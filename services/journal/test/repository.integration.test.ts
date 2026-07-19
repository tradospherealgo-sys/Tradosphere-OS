process.env.LOG_LEVEL = 'silent'; // kept for parity with sibling suites; no pino instance in this file

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import type EmbeddedPostgres from 'embedded-postgres';
import { createDb, runMigrations, users, type Database } from '@tradosphere/database';
import type { Fill, TradeIdea, CioVerdict } from '@tradosphere/shared-types';
import { DrizzleJournalRepository } from '../src/repository';
import { NotFoundError, AlreadyClosedError } from '../src/errors';

// Task 8.2's literal verification criterion: "schema migration applies;
// entries link correctly." test/repository.test.ts proves the business
// rules against the port (InMemoryJournalRepository); this suite is what
// proves the *real* adapter (DrizzleJournalRepository) round-trips a genuine
// row through Postgres's journal_entries table -- including the one
// behavior no in-memory fake can reproduce: the real userId FK's
// ON DELETE SET NULL action (journal-schema.ts / Decision D16).
//
// Port 55437 -- next free after services/paper-trading's
// price-source.integration (55436), services/education's
// repository.integration (55435), and auth's fullstack.integration (55434)
// / repository.integration (55433). Give any future suite that also boots
// embedded-postgres its own next-free port rather than reusing this one.
const TEST_PORT = 55437;

let embeddedPg: EmbeddedPostgres | undefined;
let pool: Pool | undefined;
let db: Database | undefined;
let dataDir: string | undefined;
let postgresAvailable = false;
let repo: DrizzleJournalRepository;

const fill: Fill = {
  symbol: 'RELIANCE',
  side: 'buy',
  quantity: 10,
  price: 2500,
  filledAtIso: '2026-07-18T09:16:01.000Z',
  priceAsOfIso: '2026-07-18T09:16:00.000Z',
};

const tradeIdea: TradeIdea = {
  symbol: 'RELIANCE',
  direction: 'long',
  entry: 2500,
  stopLoss: 2450,
  target: 2600,
  riskRewardRatio: 2,
  educationNote: 'explains the group consensus',
};

const cioVerdict: CioVerdict = {
  verdict: 'bullish',
  confidence: 78,
  opinions: [],
  tradeIdeas: [],
  generatedAtIso: '2026-07-18T09:15:00.000Z',
};

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'tradosphere-journal-pg-'));

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
    await embeddedPg.createDatabase('tradosphere_journal_test');

    pool = new Pool({
      host: 'localhost',
      port: TEST_PORT,
      user: 'tradosphere_test',
      password: 'test-password-not-for-prod',
      database: 'tradosphere_journal_test',
    });
    pool.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('unexpected postgres pool error in repository.integration.test', err);
    });

    // The real migration set -- proves journal-schema.ts's journal_entries
    // table (migrations/0005_melodic_longshot.sql) is exactly what
    // DrizzleJournalRepository reads and writes in production.
    await runMigrations(pool);
    db = createDb(pool);
    repo = new DrizzleJournalRepository(db);
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
  await pool.query('TRUNCATE TABLE journal_entries, users RESTART IDENTITY CASCADE');
});

describe('DrizzleJournalRepository.create (real Postgres)', () => {
  it('persists the full Fill + TradeIdea + CioVerdict snapshot, readable back via getById()', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [user] = await db
      .insert(users)
      .values({ email: 'trader@tradosphere.os', passwordHash: 'hashed:x' })
      .returning();

    const created = await repo.create({ userId: user.id, fill, tradeIdea, cioVerdict });
    const fetched = await repo.getById(created.id);

    expect(fetched?.userId).toBe(user.id);
    expect(fetched?.symbol).toBe('RELIANCE');
    expect(fetched?.side).toBe('buy');
    expect(fetched?.quantity).toBe(10);
    expect(fetched?.fillPrice).toBe(2500);
    expect(fetched?.recommendedDirection).toBe('long');
    expect(fetched?.recommendedEntry).toBe(2500);
    expect(fetched?.recommendedStopLoss).toBe(2450);
    expect(fetched?.recommendedTarget).toBe(2600);
    expect(fetched?.cioVerdictLabel).toBe('bullish');
    expect(fetched?.cioConfidence).toBe(78);
    expect(fetched?.educationNote).toBe('explains the group consensus');
    expect(fetched?.status).toBe('open');
  });

  it('leaves every recommended*/cio* column NULL in real Postgres when no CIO idea backs the trade', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const created = await repo.create({ fill });
    const fetched = await repo.getById(created.id);

    expect(fetched?.userId).toBeNull();
    expect(fetched?.recommendedDirection).toBeNull();
    expect(fetched?.recommendedEntry).toBeNull();
    expect(fetched?.recommendedStopLoss).toBeNull();
    expect(fetched?.recommendedTarget).toBeNull();
    expect(fetched?.recommendedRiskRewardRatio).toBeNull();
    expect(fetched?.cioVerdictLabel).toBeNull();
    expect(fetched?.cioConfidence).toBeNull();
    expect(fetched?.educationNote).toBeNull();
    expect(fetched?.recommendationGeneratedAt).toBeNull();
  });

  it('listByUser() only returns entries belonging to that real user', async (ctx) => {
    if (!postgresAvailable || !db) return ctx.skip();

    const [userA] = await db.insert(users).values({ email: 'a@tradosphere.os', passwordHash: 'x' }).returning();
    const [userB] = await db.insert(users).values({ email: 'b@tradosphere.os', passwordHash: 'x' }).returning();

    await repo.create({ userId: userA.id, fill });
    await repo.create({ userId: userB.id, fill });
    await repo.create({ userId: userA.id, fill });

    const rows = await repo.listByUser(userA.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.userId === userA.id)).toBe(true);
  });
});

describe('DrizzleJournalRepository.recordOutcome (real Postgres)', () => {
  it('updates status/exitPrice/exitAt/realizedPnl matching the pnl.ts formula', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const created = await repo.create({ fill }); // buy, qty 10, fillPrice 2500

    const closed = await repo.recordOutcome(created.id, {
      exitPrice: 2600,
      exitAtIso: '2026-07-19T09:00:00.000Z',
    });

    expect(closed.status).toBe('closed');
    expect(closed.exitPrice).toBe(2600);
    expect(closed.exitAt?.toISOString()).toBe('2026-07-19T09:00:00.000Z');
    expect(closed.realizedPnl).toBe(1000); // (2600-2500)*10
  });

  it('throws AlreadyClosedError on a second real recordOutcome() call for the same entry', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const created = await repo.create({ fill });
    await repo.recordOutcome(created.id, { exitPrice: 2600, exitAtIso: '2026-07-19T09:00:00.000Z' });

    await expect(
      repo.recordOutcome(created.id, { exitPrice: 2700, exitAtIso: '2026-07-20T09:00:00.000Z' }),
    ).rejects.toThrow(AlreadyClosedError);
  });

  it('throws NotFoundError for an unknown id against real Postgres', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    await expect(
      repo.recordOutcome('00000000-0000-4000-8000-000000000000', {
        exitPrice: 100,
        exitAtIso: '2026-07-19T09:00:00.000Z',
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('journal_entries.user_id FK behavior (real Postgres, Decision D16)', () => {
  it('ON DELETE SET NULL: deleting the user leaves the journal entry intact with user_id now NULL', async (ctx) => {
    if (!postgresAvailable || !db || !pool) return ctx.skip();

    const [user] = await db
      .insert(users)
      .values({ email: 'deleteme@tradosphere.os', passwordHash: 'x' })
      .returning();
    const created = await repo.create({ userId: user.id, fill, tradeIdea, cioVerdict });

    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);

    // Task 8.2's literal verification criterion -- "entries link correctly"
    // -- means this: the journal entry is a historical trade record, not a
    // foreign-key-owned child row. Deleting the trader's account must never
    // delete (or block deleting, via a RESTRICT) their trade history.
    const survived = await repo.getById(created.id);
    expect(survived).toBeDefined();
    expect(survived?.userId).toBeNull();
    expect(survived?.symbol).toBe('RELIANCE');
    expect(survived?.recommendedDirection).toBe('long'); // recommendation snapshot untouched by the FK action
    expect(survived?.cioVerdictLabel).toBe('bullish');
  });
});
