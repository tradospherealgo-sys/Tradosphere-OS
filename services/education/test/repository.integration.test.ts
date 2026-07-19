process.env.LOG_LEVEL = 'silent'; // kept for parity with sibling suites; no pino instance in this file

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import type EmbeddedPostgres from 'embedded-postgres';
import { createDb, runMigrations, users, type Database } from '@tradosphere/database';
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
import { NotFoundError, SlugInUseError, DuplicateError } from '../src/errors';

// Task 7.1 follow-up (mirrors services/auth/test/repository.integration.test.ts):
// test/fakes.ts's InMemory* doubles enforce the same *contract* the real
// adapters enforce, but several behaviors below only exist in the real
// adapters and cannot be exercised by pg-mem (no `.returning()` support, see
// auth's file-header comment) or by the in-memory fakes (which don't talk to
// Postgres at all):
//   - real unique-constraint violations (23505) on every content type's slug
//   - the real (course_id, slug) composite unique index for lessons, and the
//     real (quiz_id, order_index) composite unique index for quiz questions
//   - the update()-writes-a-revision-then-bumps-version transaction actually
//     committing both writes atomically against Postgres, not a JS array push
//   - the real onConflictDoUpdate upsert on progress (target must match the
//     schema's actual unique index or Postgres rejects the query outright)
//   - real full-text search (to_tsvector/plainto_tsquery), which stems words
//     the in-memory fakes' crude `.includes()` filter cannot
//   - the real FK from createdBy/editedBy/progress.userId/quizAttempts.userId
//     into auth's own `users` table -- the in-memory fakes and app.test.ts's
//     minted JWTs both accept an arbitrary string for these fields, but a
//     real deployment requires the id to be a genuine users row (set null on
//     delete for createdBy/editedBy, cascade for progress/quizAttempts).
//   - the real FK cascade removing a course's lessons/quizzes when the course
//     itself is removed (education-schema.ts's onDelete: 'cascade'), which
//     each in-memory fake explicitly does NOT reproduce (see fakes.ts's
//     InMemoryCourseRepository.remove() comment).
//
// Port 55435 -- distinct from auth's repository.integration.test.ts (55433)
// and fullstack.integration.test.ts (55434) so all three suites can run
// concurrently (e.g. in CI) without colliding. Give any future suite that
// also boots embedded-postgres its own next-free port rather than reusing
// this one.
const TEST_PORT = 55435;

let embeddedPg: EmbeddedPostgres | undefined;
let pool: Pool | undefined;
let db: Database | undefined;
let dataDir: string | undefined;
let postgresAvailable = false;

let categoryRepo: DrizzleCategoryRepository;
let tagRepo: DrizzleTagRepository;
let glossaryRepo: DrizzleGlossaryRepository;
let courseRepo: DrizzleCourseRepository;
let lessonRepo: DrizzleLessonRepository;
let strategyRepo: DrizzleStrategyRepository;
let quizRepo: DrizzleQuizRepository;
let quizQuestionRepo: DrizzleQuizQuestionRepository;
let contentTagRepo: DrizzleContentTagRepository;
let revisionRepo: DrizzleRevisionRepository;
let progressRepo: DrizzleProgressRepository;
let quizAttemptRepo: DrizzleQuizAttemptRepository;

// A real users row -- see file-header comment. Re-created fresh in
// beforeEach (after the TRUNCATE below) so every test gets a valid FK target
// without needing services/auth's own repository in this package at all.
let userId: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'tradosphere-education-pg-'));

  try {
    // Dynamic import -- embedded-postgres is ESM-only; see auth's
    // repository.integration.test.ts for the full ERR_REQUIRE_ESM writeup.
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
    await embeddedPg.createDatabase('tradosphere_education_test');

    pool = new Pool({
      host: 'localhost',
      port: TEST_PORT,
      user: 'tradosphere_test',
      password: 'test-password-not-for-prod',
      database: 'tradosphere_education_test',
    });
    pool.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('unexpected postgres pool error in repository.integration.test', err);
    });

    // The real boot path (services/education/src/index.ts) -- proves the
    // full migration set (including the education-schema tables) actually
    // produces a schema every Drizzle*Repository below can read and write.
    await runMigrations(pool);
    db = createDb(pool);
    categoryRepo = new DrizzleCategoryRepository(db);
    tagRepo = new DrizzleTagRepository(db);
    glossaryRepo = new DrizzleGlossaryRepository(db);
    courseRepo = new DrizzleCourseRepository(db);
    lessonRepo = new DrizzleLessonRepository(db);
    strategyRepo = new DrizzleStrategyRepository(db);
    quizRepo = new DrizzleQuizRepository(db);
    quizQuestionRepo = new DrizzleQuizQuestionRepository(db);
    contentTagRepo = new DrizzleContentTagRepository(db);
    revisionRepo = new DrizzleRevisionRepository(db);
    progressRepo = new DrizzleProgressRepository(db);
    quizAttemptRepo = new DrizzleQuizAttemptRepository(db);
    postgresAvailable = true;
  } catch (err) {
    // Environment-blocked, not a code failure -- every test below checks
    // `postgresAvailable` and skips itself rather than failing on an
    // infrastructure gap (same pattern as auth's equivalent suite).
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
  if (!postgresAvailable || !pool || !db) return;
  // Fresh tables per test, children-before-parents order, CASCADE as a
  // backstop -- same isolation reasoning as auth's equivalent beforeEach.
  await pool.query(
    `TRUNCATE TABLE quiz_attempts, education_user_progress, education_content_revisions,
     education_content_tags, quiz_questions, quizzes, strategies, lessons, courses,
     glossary_terms, education_tags, education_categories, users RESTART IDENTITY CASCADE`,
  );
  const [user] = await db.insert(users).values({ email: 'author@tradosphere.os', passwordHash: 'hashed:x' }).returning();
  userId = user.id;
});

describe('DrizzleCategoryRepository & DrizzleTagRepository (real Postgres)', () => {
  it('create() persists a category, returned by list() ordered by name', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    await categoryRepo.create({ slug: 'risk-management', name: 'Risk Management' });
    await categoryRepo.create({ slug: 'charting', name: 'Charting' });

    const list = await categoryRepo.list();
    expect(list.map((c) => c.name)).toEqual(['Charting', 'Risk Management']);
  });

  it('enforces the real unique slug constraint (education_categories_slug_unique)', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    await categoryRepo.create({ slug: 'charting', name: 'Charting' });
    await expect(categoryRepo.create({ slug: 'charting', name: 'Charting Again' })).rejects.toThrow(SlugInUseError);
  });

  it('create() persists a tag, returned by list() ordered by name', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    await tagRepo.create({ slug: 'options', name: 'Options' });
    await tagRepo.create({ slug: 'beginner', name: 'Beginner' });

    const list = await tagRepo.list();
    expect(list.map((t) => t.name)).toEqual(['Beginner', 'Options']);
  });

  it('enforces the real unique slug constraint (education_tags_slug_unique)', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    await tagRepo.create({ slug: 'options', name: 'Options' });
    await expect(tagRepo.create({ slug: 'options', name: 'Options Again' })).rejects.toThrow(SlugInUseError);
  });
});

describe('DrizzleGlossaryRepository (real Postgres)', () => {
  it('create() persists a term with createdBy pointing at a real users row', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const term = await glossaryRepo.create({
      slug: 'long-position',
      term: 'Long Position',
      definition: 'Buying an asset expecting its price to rise.',
      createdBy: userId,
    });

    expect(term.id).toEqual(expect.any(String));
    expect(term.createdBy).toBe(userId);
    expect(term.version).toBe(1);
    expect(term.status).toBe('draft'); // schema default
  });

  it('getBySlug() returns the created term, and undefined for an unknown slug', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const created = await glossaryRepo.create({
      slug: 'short-position',
      term: 'Short Position',
      definition: 'Selling a borrowed asset expecting its price to fall.',
    });

    expect(await glossaryRepo.getBySlug('short-position')).toEqual(created);
    expect(await glossaryRepo.getBySlug('does-not-exist')).toBeUndefined();
  });

  it('enforces the real unique slug constraint (glossary_terms_slug_unique)', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    await glossaryRepo.create({ slug: 'spread', term: 'Spread', definition: 'The gap between bid and ask.' });
    await expect(
      glossaryRepo.create({ slug: 'spread', term: 'Spread Again', definition: 'Duplicate.' }),
    ).rejects.toThrow(SlugInUseError);
  });

  it('update() writes a revision row and bumps version inside one transaction', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const created = await glossaryRepo.create({
      slug: 'stop-loss',
      term: 'Stop-Loss',
      definition: 'An order that limits downside risk.',
    });

    const updated = await glossaryRepo.update(
      'stop-loss',
      { definition: 'An order that automatically closes a position at a set price to limit loss.' },
      userId,
    );

    expect(updated.version).toBe(2);
    expect(updated.definition).toBe('An order that automatically closes a position at a set price to limit loss.');

    const revisions = await revisionRepo.listForContent('glossary_term', created.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0].version).toBe(1); // pre-update snapshot, not the new version
    expect(revisions[0].editedBy).toBe(userId);
    expect((revisions[0].snapshot as { definition: string }).definition).toBe('An order that limits downside risk.');
  });

  it('update() throws NotFoundError for an unknown slug', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    await expect(glossaryRepo.update('does-not-exist', { definition: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('list() with a search filter uses real full-text search (stemming), not literal substring match', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    await glossaryRepo.create({
      slug: 'candlestick',
      term: 'Candlestick',
      definition: 'A candlestick chart displays price action over a fixed interval.',
    });
    await glossaryRepo.create({
      slug: 'diversification',
      term: 'Diversification',
      definition: 'Spreading capital across assets to reduce concentrated risk.',
    });

    // Plural "candlesticks" against the singular indexed "candlestick" --
    // only real to_tsvector/plainto_tsquery stemming resolves this; a plain
    // substring filter (test/fakes.ts's InMemoryGlossaryRepository) would
    // also happen to work here by coincidence, but a Postgres-only case like
    // this proves the SQL itself is correct, not just the port's contract.
    const results = await glossaryRepo.list({ search: 'candlesticks' });
    expect(results.map((r) => r.slug)).toEqual(['candlestick']);
  });
});

describe('DrizzleCourseRepository (real Postgres)', () => {
  it('create() + update() persists a course, bumps version, and writes a revision row', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const created = await courseRepo.create({
      slug: 'options-101',
      title: 'Options 101',
      description: 'An introduction to options trading.',
      createdBy: userId,
    });
    expect(created.difficulty).toBe('beginner'); // schema default

    const updated = await courseRepo.update('options-101', { title: 'Options 101: The Basics' }, userId);
    expect(updated.version).toBe(2);
    expect(updated.title).toBe('Options 101: The Basics');

    const revisions = await revisionRepo.listForContent('course', created.id);
    expect(revisions).toHaveLength(1);
    expect((revisions[0].snapshot as { title: string }).title).toBe('Options 101');
  });

  it('enforces the real unique slug constraint (courses_slug_unique)', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    await courseRepo.create({ slug: 'options-101', title: 'Options 101', description: 'x' });
    await expect(
      courseRepo.create({ slug: 'options-101', title: 'Options 101 Again', description: 'y' }),
    ).rejects.toThrow(SlugInUseError);
  });

  it('remove() cascades to its lessons and quizzes via the real FK (onDelete: cascade)', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const course = await courseRepo.create({ slug: 'cascade-course', title: 'Cascade Course', description: 'x' });
    await lessonRepo.create({ courseId: course.id, slug: 'lesson-one', title: 'Lesson One', content: 'x' });
    const quiz = await quizRepo.create({ slug: 'cascade-quiz', title: 'Cascade Quiz', courseId: course.id });

    await courseRepo.remove('cascade-course');

    // Each in-memory fake's remove() is a plain Map delete with no cascade
    // (fakes.ts says so explicitly) -- this is the one place that gap gets
    // closed against the real FK.
    expect(await lessonRepo.listByCourse(course.id)).toEqual([]);
    expect(await quizRepo.getBySlug('cascade-quiz')).toBeUndefined();
    expect(quiz.id).toEqual(expect.any(String)); // sanity: quiz really was created before the cascade
  });
});

describe('DrizzleLessonRepository (real Postgres)', () => {
  it('scopes slug uniqueness per-course: the same slug is allowed in two different courses', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const courseA = await courseRepo.create({ slug: 'course-a', title: 'Course A', description: 'x' });
    const courseB = await courseRepo.create({ slug: 'course-b', title: 'Course B', description: 'x' });

    const lessonA = await lessonRepo.create({ courseId: courseA.id, slug: 'intro', title: 'Intro', content: 'x' });
    const lessonB = await lessonRepo.create({ courseId: courseB.id, slug: 'intro', title: 'Intro', content: 'y' });

    expect(lessonA.id).not.toBe(lessonB.id);
  });

  it('enforces the real composite unique constraint (lessons_course_slug_unique) within one course', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const course = await courseRepo.create({ slug: 'course-a', title: 'Course A', description: 'x' });
    await lessonRepo.create({ courseId: course.id, slug: 'intro', title: 'Intro', content: 'x' });

    await expect(
      lessonRepo.create({ courseId: course.id, slug: 'intro', title: 'Intro Again', content: 'y' }),
    ).rejects.toThrow(SlugInUseError);
  });

  it('update() bumps version and writes a revision row keyed to the lesson, not the course', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const course = await courseRepo.create({ slug: 'course-a', title: 'Course A', description: 'x' });
    const lesson = await lessonRepo.create({ courseId: course.id, slug: 'intro', title: 'Intro', content: 'v1' });

    const updated = await lessonRepo.update(course.id, 'intro', { content: 'v2' }, userId);
    expect(updated.version).toBe(2);

    const revisions = await revisionRepo.listForContent('lesson', lesson.id);
    expect(revisions).toHaveLength(1);
    expect((revisions[0].snapshot as { content: string }).content).toBe('v1');
  });
});

describe('DrizzleStrategyRepository (real Postgres)', () => {
  it('create() + update() persists a strategy, bumps version, and writes a revision row', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const created = await strategyRepo.create({
      slug: 'covered-call',
      name: 'Covered Call',
      description: 'Sell a call against a long stock position.',
    });

    const updated = await strategyRepo.update('covered-call', { description: 'Updated description.' }, userId);
    expect(updated.version).toBe(2);

    const revisions = await revisionRepo.listForContent('strategy', created.id);
    expect(revisions).toHaveLength(1);
  });

  it('enforces the real unique slug constraint (strategies_slug_unique)', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    await strategyRepo.create({ slug: 'covered-call', name: 'Covered Call', description: 'x' });
    await expect(
      strategyRepo.create({ slug: 'covered-call', name: 'Covered Call Again', description: 'y' }),
    ).rejects.toThrow(SlugInUseError);
  });
});

describe('DrizzleQuizRepository & DrizzleQuizQuestionRepository (real Postgres)', () => {
  it('create() persists a quiz scoped to a real course', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const course = await courseRepo.create({ slug: 'quiz-course', title: 'Quiz Course', description: 'x' });
    const quiz = await quizRepo.create({ slug: 'quiz-one', title: 'Quiz One', courseId: course.id });

    expect(quiz.courseId).toBe(course.id);
    expect(await quizRepo.getBySlug('quiz-one')).toEqual(quiz);
  });

  it('enforces the real unique slug constraint (quizzes_slug_unique)', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    await quizRepo.create({ slug: 'quiz-one', title: 'Quiz One' });
    await expect(quizRepo.create({ slug: 'quiz-one', title: 'Quiz One Again' })).rejects.toThrow(SlugInUseError);
  });

  it('enforces the real composite unique constraint (quiz_questions_quiz_order_unique) within one quiz', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const quiz = await quizRepo.create({ slug: 'quiz-one', title: 'Quiz One' });
    await quizQuestionRepo.create({
      quizId: quiz.id,
      question: 'Q1',
      options: ['A', 'B'],
      correctOptionIndex: 0,
      orderIndex: 0,
    });

    await expect(
      quizQuestionRepo.create({
        quizId: quiz.id,
        question: 'Q1 duplicate order_index',
        options: ['A', 'B'],
        correctOptionIndex: 1,
        orderIndex: 0,
      }),
    ).rejects.toThrow(DuplicateError);
  });

  it('allows the same order_index across two different quizzes, and listByQuiz() returns them ordered', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const quizA = await quizRepo.create({ slug: 'quiz-a', title: 'Quiz A' });
    const quizB = await quizRepo.create({ slug: 'quiz-b', title: 'Quiz B' });

    await quizQuestionRepo.create({ quizId: quizA.id, question: 'A0', options: ['x', 'y'], correctOptionIndex: 0, orderIndex: 0 });
    await quizQuestionRepo.create({ quizId: quizB.id, question: 'B0', options: ['x', 'y'], correctOptionIndex: 0, orderIndex: 0 });
    // Inserted out of order on purpose -- listByQuiz() must sort by
    // orderIndex, not by insertion/creation order.
    await quizQuestionRepo.create({ quizId: quizA.id, question: 'A2', options: ['x', 'y'], correctOptionIndex: 0, orderIndex: 2 });
    await quizQuestionRepo.create({ quizId: quizA.id, question: 'A1', options: ['x', 'y'], correctOptionIndex: 0, orderIndex: 1 });

    const questionsA = await quizQuestionRepo.listByQuiz(quizA.id);
    expect(questionsA.map((q) => q.question)).toEqual(['A0', 'A1', 'A2']);
  });
});

describe('DrizzleContentTagRepository (real Postgres)', () => {
  it('attach() + listForContent() round-trips a real inner join against education_tags', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const course = await courseRepo.create({ slug: 'tagged-course', title: 'Tagged Course', description: 'x' });
    const tag = await tagRepo.create({ slug: 'options', name: 'Options' });

    await contentTagRepo.attach('course', course.id, tag.id);

    const tags = await contentTagRepo.listForContent('course', course.id);
    expect(tags).toEqual([tag]);
  });

  it('enforces the real unique constraint (education_content_tags_unique): duplicate attach throws DuplicateError', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const course = await courseRepo.create({ slug: 'tagged-course', title: 'Tagged Course', description: 'x' });
    const tag = await tagRepo.create({ slug: 'options', name: 'Options' });
    await contentTagRepo.attach('course', course.id, tag.id);

    await expect(contentTagRepo.attach('course', course.id, tag.id)).rejects.toThrow(DuplicateError);
  });

  it('detach() removes the row so listForContent() no longer includes it', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const course = await courseRepo.create({ slug: 'tagged-course', title: 'Tagged Course', description: 'x' });
    const tag = await tagRepo.create({ slug: 'options', name: 'Options' });
    await contentTagRepo.attach('course', course.id, tag.id);

    await contentTagRepo.detach('course', course.id, tag.id);

    expect(await contentTagRepo.listForContent('course', course.id)).toEqual([]);
  });
});

describe('DrizzleProgressRepository (real Postgres)', () => {
  it('upsert() inserts a new row on first call', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const course = await courseRepo.create({ slug: 'progress-course', title: 'Progress Course', description: 'x' });
    const row = await progressRepo.upsert({
      userId,
      contentType: 'course',
      contentId: course.id,
      status: 'in_progress',
      progressPct: 40,
    });

    expect(row.status).toBe('in_progress');
    expect(row.progressPct).toBe(40);
    expect(row.completedAt).toBeNull();
  });

  it('upsert() updates the same row in place via the real onConflictDoUpdate, not a duplicate row', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const course = await courseRepo.create({ slug: 'progress-course', title: 'Progress Course', description: 'x' });
    const first = await progressRepo.upsert({
      userId,
      contentType: 'course',
      contentId: course.id,
      status: 'in_progress',
      progressPct: 40,
    });

    const second = await progressRepo.upsert({
      userId,
      contentType: 'course',
      contentId: course.id,
      status: 'completed',
      progressPct: 100,
    });

    expect(second.id).toBe(first.id); // same row, not a new one
    expect(second.completedAt).toBeInstanceOf(Date);

    const rows = await progressRepo.listForUser(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].progressPct).toBe(100);
  });

  it('upsert() clears completedAt when status moves away from completed', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const course = await courseRepo.create({ slug: 'progress-course', title: 'Progress Course', description: 'x' });
    await progressRepo.upsert({ userId, contentType: 'course', contentId: course.id, status: 'completed' });

    const reopened = await progressRepo.upsert({
      userId,
      contentType: 'course',
      contentId: course.id,
      status: 'in_progress',
      progressPct: 60,
    });

    expect(reopened.completedAt).toBeNull();
  });

  it('listForUser() only returns rows belonging to that user', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const [otherUser] = await db!.insert(users).values({ email: 'other@tradosphere.os', passwordHash: 'x' }).returning();
    const course = await courseRepo.create({ slug: 'progress-course', title: 'Progress Course', description: 'x' });

    await progressRepo.upsert({ userId, contentType: 'course', contentId: course.id, status: 'in_progress' });
    await progressRepo.upsert({ userId: otherUser.id, contentType: 'course', contentId: course.id, status: 'completed' });

    const rows = await progressRepo.listForUser(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(userId);
  });
});

describe('DrizzleQuizAttemptRepository (real Postgres)', () => {
  it('record() persists an attempt scoped to a real user and quiz', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const quiz = await quizRepo.create({ slug: 'attempt-quiz', title: 'Attempt Quiz' });
    const attempt = await quizAttemptRepo.record({
      userId,
      quizId: quiz.id,
      score: 1,
      totalQuestions: 2,
      answers: [
        { questionId: '00000000-0000-4000-8000-000000000000', selectedOptionIndex: 0, correct: true },
        { questionId: '00000000-0000-4000-8000-000000000001', selectedOptionIndex: 1, correct: false },
      ],
    });

    expect(attempt.id).toEqual(expect.any(String));
    expect(attempt.score).toBe(1);
    expect(attempt.answers).toHaveLength(2);
  });

  it('listForUser() filters by quizId when provided, and returns all attempts otherwise', async (ctx) => {
    if (!postgresAvailable) return ctx.skip();

    const quizA = await quizRepo.create({ slug: 'attempt-quiz-a', title: 'Attempt Quiz A' });
    const quizB = await quizRepo.create({ slug: 'attempt-quiz-b', title: 'Attempt Quiz B' });
    await quizAttemptRepo.record({ userId, quizId: quizA.id, score: 1, totalQuestions: 1, answers: [] });
    await quizAttemptRepo.record({ userId, quizId: quizB.id, score: 0, totalQuestions: 1, answers: [] });

    expect(await quizAttemptRepo.listForUser(userId, quizA.id)).toHaveLength(1);
    expect(await quizAttemptRepo.listForUser(userId)).toHaveLength(2);
  });
});
