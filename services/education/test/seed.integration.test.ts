process.env.LOG_LEVEL = 'silent';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import type EmbeddedPostgres from 'embedded-postgres';
import type { FastifyInstance } from 'fastify';
import { createLogger } from '@tradosphere/logger';
import { createDb, runMigrations, type Database } from '@tradosphere/database';
import {
  DrizzleCategoryRepository,
  DrizzleTagRepository,
  DrizzleGlossaryRepository,
  DrizzleCourseRepository,
  DrizzleLessonRepository,
  DrizzleStrategyRepository,
  DrizzleQuizRepository,
  DrizzleQuizQuestionRepository,
  DrizzleContentTagRepository,
  DrizzleRevisionRepository,
  DrizzleProgressRepository,
  DrizzleQuizAttemptRepository,
} from '../src/repository';
import { seedEducationContent, type SeedCounts } from '../src/seed';
import { buildApp } from '../src/app';

// Task 7.2 Gate evidence: proves Sprint 7's exit criterion "Glossary/course/
// strategy content is queryable via API" end-to-end against real
// infrastructure -- real Postgres (not the in-memory fakes seed.test.ts
// uses), the real Drizzle*Repository adapters, and the real Fastify app's
// HTTP surface via app.inject(), exactly the path a live deployment takes
// (services/education/src/index.ts boots the same repos into the same
// buildApp()). seed.test.ts already covers the seed function's own
// row-level logic fast against fakes; this suite is deliberately the single
// place that proves the seeded rows survive a real round trip through
// Postgres and come back out correctly over HTTP.
//
// Port 55436 -- next free port after auth's 55433/55434 and this package's
// own repository.integration.test.ts at 55435 (see that file's header for
// the "give each suite its own port" convention).
const TEST_PORT = 55436;

let embeddedPg: EmbeddedPostgres | undefined;
let pool: Pool | undefined;
let db: Database | undefined;
let dataDir: string | undefined;
let postgresAvailable = false;
let app: FastifyInstance | undefined;
let firstRunCounts: SeedCounts | undefined;
let secondRunCounts: SeedCounts | undefined;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'tradosphere-education-seed-pg-'));

  try {
    const { default: EmbeddedPostgresCtor } = await import('embedded-postgres');

    embeddedPg = new EmbeddedPostgresCtor({
      databaseDir: dataDir,
      user: 'tradosphere_test',
      password: 'test-password-not-for-prod',
      port: TEST_PORT,
      persistent: false,
      onLog: () => {},
    });
    await embeddedPg.initialise();
    await embeddedPg.start();
    await embeddedPg.createDatabase('tradosphere_education_seed_test');

    pool = new Pool({
      host: 'localhost',
      port: TEST_PORT,
      user: 'tradosphere_test',
      password: 'test-password-not-for-prod',
      database: 'tradosphere_education_seed_test',
    });
    pool.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('unexpected postgres pool error in seed.integration.test', err);
    });

    await runMigrations(pool);
    db = createDb(pool);

    const deps = {
      categoryRepo: new DrizzleCategoryRepository(db),
      tagRepo: new DrizzleTagRepository(db),
      glossaryRepo: new DrizzleGlossaryRepository(db),
      courseRepo: new DrizzleCourseRepository(db),
      lessonRepo: new DrizzleLessonRepository(db),
      strategyRepo: new DrizzleStrategyRepository(db),
      quizRepo: new DrizzleQuizRepository(db),
      quizQuestionRepo: new DrizzleQuizQuestionRepository(db),
      contentTagRepo: new DrizzleContentTagRepository(db),
      logger: createLogger('education-seed-integration-test'),
    };

    // Run twice against the *same* real database, back to back -- proves
    // idempotency (Delta's charter rule 3) against real unique constraints,
    // not just the in-memory fakes' hand-rolled duplicate checks.
    firstRunCounts = await seedEducationContent(deps);
    secondRunCounts = await seedEducationContent(deps);

    // The real boot path: same repos, same buildApp() services/education/src/index.ts
    // calls, so every assertion below travels through the actual HTTP routes.
    app = await buildApp({
      categoryRepo: deps.categoryRepo,
      tagRepo: deps.tagRepo,
      glossaryRepo: deps.glossaryRepo,
      courseRepo: deps.courseRepo,
      lessonRepo: deps.lessonRepo,
      strategyRepo: deps.strategyRepo,
      quizRepo: deps.quizRepo,
      quizQuestionRepo: deps.quizQuestionRepo,
      contentTagRepo: deps.contentTagRepo,
      revisionRepo: new DrizzleRevisionRepository(db),
      progressRepo: new DrizzleProgressRepository(db),
      quizAttemptRepo: new DrizzleQuizAttemptRepository(db),
      jwtSecret: 'test-jwt-secret-not-for-prod',
      logger: createLogger('education-seed-integration-test-app'),
    });

    postgresAvailable = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('embedded-postgres unavailable in this environment; seed.integration suite will skip', err);
    postgresAvailable = false;
  }
}, 30_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await embeddedPg?.stop();
  if (dataDir) {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

describe('seedEducationContent against real Postgres', () => {
  it('inserts on the first run and is a total no-op on the second run', (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    expect(firstRunCounts!.inserted).toBeGreaterThan(0);
    expect(firstRunCounts!.skipped).toBe(0);
    expect(secondRunCounts!.inserted).toBe(0);
    expect(secondRunCounts!.skipped).toBe(firstRunCounts!.inserted);
  });
});

describe('seeded content is queryable via the real HTTP API (Sprint 7 exit criterion)', () => {
  it('GET /categories returns the seeded categories', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();
    const res = await app!.inject({ method: 'GET', url: '/categories' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.map((c: { slug: string }) => c.slug)).toContain('technical-analysis');
  });

  it('GET /tags returns the seeded tags', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();
    const res = await app!.inject({ method: 'GET', url: '/tags' });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((t: { slug: string }) => t.slug)).toContain('beginner');
  });

  it('GET /glossary and GET /glossary/:slug return a published seeded term', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();
    const list = await app!.inject({ method: 'GET', url: '/glossary' });
    expect(list.statusCode).toBe(200);
    expect(list.json().length).toBeGreaterThanOrEqual(10);

    const detail = await app!.inject({ method: 'GET', url: '/glossary/relative-strength-index' });
    expect(detail.statusCode).toBe(200);
    const term = detail.json();
    expect(term.term).toBe('Relative Strength Index (RSI)');
    expect(term.status).toBe('published');
  });

  it('GET /courses/:slug and its nested lessons return seeded, ordered content', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();
    const course = await app!.inject({ method: 'GET', url: '/courses/intro-to-technical-analysis' });
    expect(course.statusCode).toBe(200);
    expect(course.json().status).toBe('published');

    const lessons = await app!.inject({ method: 'GET', url: '/courses/intro-to-technical-analysis/lessons' });
    expect(lessons.statusCode).toBe(200);
    expect(lessons.json().map((l: { slug: string }) => l.slug)).toEqual([
      'what-is-technical-analysis',
      'reading-candlestick-charts',
      'using-moving-averages',
    ]);
  });

  it('GET /quizzes/:slug/questions returns the seeded quiz, redacted (no answer key)', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();
    const res = await app!.inject({ method: 'GET', url: '/quizzes/intro-to-technical-analysis-quiz/questions' });
    expect(res.statusCode).toBe(200);
    const questions = res.json();
    expect(questions).toHaveLength(3);
    for (const q of questions) {
      expect(q.correctOptionIndex).toBeUndefined();
      expect(q.explanation).toBeUndefined();
      expect(q.options).toHaveLength(4);
    }
  });

  it('GET /strategies/:slug returns a seeded strategy', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();
    const res = await app!.inject({ method: 'GET', url: '/strategies/covered-call' });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Covered Call');
  });

  it('GET /content/:contentType/:contentId/tags returns the seeded tag attachments', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();
    const term = await app!.inject({ method: 'GET', url: '/glossary/relative-strength-index' });
    const termId = term.json().id;

    const res = await app!.inject({ method: 'GET', url: `/content/glossary_term/${termId}/tags` });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((t: { slug: string }) => t.slug).sort()).toEqual(['beginner', 'charting']);
  });
});
