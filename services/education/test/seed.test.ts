process.env.LOG_LEVEL = 'silent';

import { describe, it, expect, beforeEach } from 'vitest';
import { createLogger } from '@tradosphere/logger';
import { seedEducationContent, type SeedDeps } from '../src/seed';
import {
  InMemoryCategoryRepository,
  InMemoryTagRepository,
  InMemoryGlossaryRepository,
  InMemoryCourseRepository,
  InMemoryLessonRepository,
  InMemoryStrategyRepository,
  InMemoryQuizRepository,
  InMemoryQuizQuestionRepository,
  InMemoryContentTagRepository,
} from './fakes';

// Task 7.2 follow-up test, per Forge's charter rule 3 (no code without a test
// in the same task). Uses the same in-memory fakes app.test.ts uses (fast,
// no real Postgres) to prove two things every "seed on boot" function must
// guarantee: (1) the content is genuinely queryable afterwards through the
// exact same repository ports app.ts's routes call, and (2) running it a
// second time is a no-op that skips every row instead of duplicating or
// erroring -- Delta's charter rule 3 ("every import is idempotent ...").
// The real-Postgres path (unique slug constraints actually enforced,
// to_tsvector search, real FK-backed categoryId) is covered by running this
// same function against embedded-postgres via seed-cli.ts, verified manually
// against the real Fastify app's HTTP surface as this task's Gate evidence.

function buildDeps(): SeedDeps {
  const tagRepo = new InMemoryTagRepository();
  return {
    categoryRepo: new InMemoryCategoryRepository(),
    tagRepo,
    glossaryRepo: new InMemoryGlossaryRepository(),
    courseRepo: new InMemoryCourseRepository(),
    lessonRepo: new InMemoryLessonRepository(),
    strategyRepo: new InMemoryStrategyRepository(),
    quizRepo: new InMemoryQuizRepository(),
    quizQuestionRepo: new InMemoryQuizQuestionRepository(),
    contentTagRepo: new InMemoryContentTagRepository(tagRepo),
    logger: createLogger('education-seed-test'),
  };
}

describe('seedEducationContent', () => {
  let deps: SeedDeps;

  beforeEach(() => {
    deps = buildDeps();
  });

  it('inserts categories, tags, glossary terms, courses, strategies on a fresh database', async () => {
    const counts = await seedEducationContent(deps);

    expect(counts.inserted).toBeGreaterThan(0);
    expect(counts.skipped).toBe(0);

    const categories = await deps.categoryRepo.list();
    expect(categories.map((c) => c.slug)).toContain('technical-analysis');

    const tags = await deps.tagRepo.list();
    expect(tags.map((t) => t.slug)).toContain('beginner');

    const glossary = await deps.glossaryRepo.list();
    expect(glossary.length).toBeGreaterThanOrEqual(10);
    expect(glossary.every((g) => g.status === 'published')).toBe(true);
  });

  it('seeds courses with their lessons and a scored quiz, all published and queryable', async () => {
    await seedEducationContent(deps);

    const course = await deps.courseRepo.getBySlug('intro-to-technical-analysis');
    expect(course).toBeDefined();
    expect(course!.status).toBe('published');

    const lessons = await deps.lessonRepo.listByCourse(course!.id);
    expect(lessons.map((l) => l.slug)).toEqual([
      'what-is-technical-analysis',
      'reading-candlestick-charts',
      'using-moving-averages',
    ]);

    const quiz = await deps.quizRepo.getBySlug('intro-to-technical-analysis-quiz');
    expect(quiz).toBeDefined();
    expect(quiz!.courseId).toBe(course!.id);

    const questions = await deps.quizQuestionRepo.listByQuiz(quiz!.id);
    expect(questions).toHaveLength(3);
    expect(questions.every((q) => q.options.length === 4)).toBe(true);
    expect(questions.every((q) => q.correctOptionIndex >= 0 && q.correctOptionIndex < q.options.length)).toBe(true);
  });

  it('resolves glossary/strategy categoryId to the seeded category row, not left null', async () => {
    await seedEducationContent(deps);

    const category = await deps.categoryRepo
      .list()
      .then((cats) => cats.find((c) => c.slug === 'technical-analysis'));
    const rsi = await deps.glossaryRepo.getBySlug('relative-strength-index');
    expect(rsi!.categoryId).toBe(category!.id);

    const crossover = await deps.strategyRepo.getBySlug('moving-average-crossover');
    expect(crossover!.categoryId).toBe(category!.id);
  });

  it('attaches declared tags to content, idempotently', async () => {
    await seedEducationContent(deps);

    const rsi = await deps.glossaryRepo.getBySlug('relative-strength-index');
    const attached = await deps.contentTagRepo.listForContent('glossary_term', rsi!.id);
    expect(attached.map((t) => t.slug).sort()).toEqual(['beginner', 'charting']);
  });

  it('is idempotent -- a second run skips every row and inserts nothing new', async () => {
    const first = await seedEducationContent(deps);
    const second = await seedEducationContent(deps);

    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(first.inserted);

    // No duplicate rows: exactly one course at this slug, exactly the
    // original 3 questions on its quiz, exactly 2 tags on the RSI term.
    const courses = await deps.courseRepo.list();
    expect(courses.filter((c) => c.slug === 'intro-to-technical-analysis')).toHaveLength(1);

    const quiz = await deps.quizRepo.getBySlug('intro-to-technical-analysis-quiz');
    const questions = await deps.quizQuestionRepo.listByQuiz(quiz!.id);
    expect(questions).toHaveLength(3);

    const rsi = await deps.glossaryRepo.getBySlug('relative-strength-index');
    const attached = await deps.contentTagRepo.listForContent('glossary_term', rsi!.id);
    expect(attached).toHaveLength(2);
  });
});
