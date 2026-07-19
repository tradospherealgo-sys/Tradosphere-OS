process.env.LOG_LEVEL = 'silent'; // keep test output clean; still a real pino instance

import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createLogger } from '@tradosphere/logger';
import { signAccessToken } from '@tradosphere/auth';
import { buildApp } from '../src/app';
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
  InMemoryRevisionRepository,
  InMemoryProgressRepository,
  InMemoryQuizAttemptRepository,
  type RevisionLog,
} from './fakes';

// Fastify's inject() drives the real route/preHandler/error-handler chain
// in-process, with no open port and no real Postgres -- same HTTP-contract
// testing approach as services/auth/test/app.test.ts. Unlike auth, this
// service issues no tokens of its own (no /signup or /login route), so
// every test that needs an authenticated caller mints one directly with
// signAccessToken({sub, role}, JWT_SECRET) -- the same secret buildApp is
// given below, so verifyAccessToken inside app.ts's requireAuth accepts it.

const JWT_SECRET = 'test-secret-not-for-prod';

describe('services/education HTTP surface', () => {
  let app: FastifyInstance;
  let categoryRepo: InMemoryCategoryRepository;
  let tagRepo: InMemoryTagRepository;
  let glossaryRepo: InMemoryGlossaryRepository;
  let courseRepo: InMemoryCourseRepository;
  let lessonRepo: InMemoryLessonRepository;
  let strategyRepo: InMemoryStrategyRepository;
  let quizRepo: InMemoryQuizRepository;
  let quizQuestionRepo: InMemoryQuizQuestionRepository;
  let contentTagRepo: InMemoryContentTagRepository;
  let revisionRepo: InMemoryRevisionRepository;
  let progressRepo: InMemoryProgressRepository;
  let quizAttemptRepo: InMemoryQuizAttemptRepository;
  let adminToken: string;
  let traderToken: string;

  beforeEach(async () => {
    // One shared RevisionLog handed to every content-repo fake plus
    // InMemoryRevisionRepository, mirroring how every DrizzleXRepository in
    // repository.ts reads/writes through one real
    // education_content_revisions table (see fakes.ts's RevisionLog comment).
    const revisions: RevisionLog = [];
    categoryRepo = new InMemoryCategoryRepository();
    tagRepo = new InMemoryTagRepository();
    glossaryRepo = new InMemoryGlossaryRepository(revisions);
    courseRepo = new InMemoryCourseRepository(revisions);
    lessonRepo = new InMemoryLessonRepository(revisions);
    strategyRepo = new InMemoryStrategyRepository(revisions);
    quizRepo = new InMemoryQuizRepository(revisions);
    quizQuestionRepo = new InMemoryQuizQuestionRepository();
    contentTagRepo = new InMemoryContentTagRepository(tagRepo);
    revisionRepo = new InMemoryRevisionRepository(revisions);
    progressRepo = new InMemoryProgressRepository();
    quizAttemptRepo = new InMemoryQuizAttemptRepository();

    app = await buildApp({
      categoryRepo,
      tagRepo,
      glossaryRepo,
      courseRepo,
      lessonRepo,
      strategyRepo,
      quizRepo,
      quizQuestionRepo,
      contentTagRepo,
      revisionRepo,
      progressRepo,
      quizAttemptRepo,
      jwtSecret: JWT_SECRET,
      logger: createLogger('education-service-test'),
    });

    adminToken = signAccessToken({ sub: 'admin-1', role: 'admin' }, JWT_SECRET);
    traderToken = signAccessToken({ sub: 'trader-1', role: 'trader' }, JWT_SECRET);
  });

  // -------------------------------------------------------------------
  // Categories & tags
  // -------------------------------------------------------------------

  describe('categories & tags', () => {
    it('GET /categories lists nothing before any are created', async () => {
      const res = await app.inject({ method: 'GET', url: '/categories' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it('POST /categories requires auth (401 without a token)', async () => {
      const res = await app.inject({ method: 'POST', url: '/categories', payload: { slug: 'options', name: 'Options' } });
      expect(res.statusCode).toBe(401);
    });

    it('POST /categories requires admin role (403 for a trader)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${traderToken}` },
        payload: { slug: 'options', name: 'Options' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('POST /categories creates a category as admin, then GET /categories lists it', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'options', name: 'Options' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().slug).toBe('options');

      const list = await app.inject({ method: 'GET', url: '/categories' });
      expect(list.json()).toHaveLength(1);
    });

    it('POST /categories rejects a duplicate slug with 409', async () => {
      await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'options', name: 'Options' },
      });
      const res = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'options', name: 'Options Again' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('POST /categories rejects an invalid slug with 400 and field-level details', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'Not A Slug', name: 'Options' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().details).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'slug' })]));
    });

    it('POST /tags creates a tag as admin, then GET /tags lists it', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tags',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'beginner-friendly', name: 'Beginner Friendly' },
      });
      expect(res.statusCode).toBe(201);
      const list = await app.inject({ method: 'GET', url: '/tags' });
      expect(list.json()).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------
  // Glossary
  // -------------------------------------------------------------------

  describe('glossary', () => {
    it('full lifecycle: create, get, list, patch, delete', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/glossary',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'alpha', term: 'Alpha', definition: 'Excess return versus a benchmark.' },
      });
      expect(create.statusCode).toBe(201);
      // createdBy comes from the JWT's sub, never a body field the client
      // could forge -- see app.ts's `{ ...validation.data, createdBy: request.authUser!.sub }`.
      expect(create.json().createdBy).toBe('admin-1');

      const get = await app.inject({ method: 'GET', url: '/glossary/alpha' });
      expect(get.statusCode).toBe(200);
      expect(get.json().term).toBe('Alpha');

      const patch = await app.inject({
        method: 'PATCH',
        url: '/glossary/alpha',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { definition: 'Updated definition.' },
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().definition).toBe('Updated definition.');
      expect(patch.json().version).toBe(2);

      const del = await app.inject({
        method: 'DELETE',
        url: '/glossary/alpha',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(del.statusCode).toBe(204);

      const afterDelete = await app.inject({ method: 'GET', url: '/glossary/alpha' });
      expect(afterDelete.statusCode).toBe(404);
    });

    it('GET /glossary/:slug returns 404 for an unknown slug', async () => {
      const res = await app.inject({ method: 'GET', url: '/glossary/does-not-exist' });
      expect(res.statusCode).toBe(404);
    });

    it('PATCH /glossary/:slug returns 404 for an unknown slug', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/glossary/does-not-exist',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { term: 'x' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /glossary rejects a missing definition with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/glossary',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'alpha', term: 'Alpha' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /glossary rejects a malformed categoryId filter with 400', async () => {
      const res = await app.inject({ method: 'GET', url: '/glossary?categoryId=not-a-uuid' });
      expect(res.statusCode).toBe(400);
    });

    it('GET /glossary?status=published filters correctly', async () => {
      await app.inject({
        method: 'POST',
        url: '/glossary',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'alpha', term: 'Alpha', definition: 'Def.', status: 'published' },
      });
      await app.inject({
        method: 'POST',
        url: '/glossary',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'beta', term: 'Beta', definition: 'Def.', status: 'draft' },
      });
      const res = await app.inject({ method: 'GET', url: '/glossary?status=published' });
      expect(res.json()).toHaveLength(1);
      expect(res.json()[0].slug).toBe('alpha');
    });
  });

  // -------------------------------------------------------------------
  // Courses
  // -------------------------------------------------------------------

  describe('courses', () => {
    it('full lifecycle: create, get, list, patch, delete', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/courses',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'options-101', title: 'Options 101', description: 'Intro to options trading.' },
      });
      expect(create.statusCode).toBe(201);
      expect(create.json().difficulty).toBe('beginner'); // repository default

      const get = await app.inject({ method: 'GET', url: '/courses/options-101' });
      expect(get.statusCode).toBe(200);

      const list = await app.inject({ method: 'GET', url: '/courses' });
      expect(list.json()).toHaveLength(1);

      const patch = await app.inject({
        method: 'PATCH',
        url: '/courses/options-101',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { difficulty: 'advanced' },
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().difficulty).toBe('advanced');

      const del = await app.inject({
        method: 'DELETE',
        url: '/courses/options-101',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(del.statusCode).toBe(204);
    });

    it('POST /courses rejects a duplicate slug with 409', async () => {
      const payload = { slug: 'options-101', title: 'Options 101', description: 'Intro.' };
      await app.inject({ method: 'POST', url: '/courses', headers: { authorization: `Bearer ${adminToken}` }, payload });
      const res = await app.inject({ method: 'POST', url: '/courses', headers: { authorization: `Bearer ${adminToken}` }, payload });
      expect(res.statusCode).toBe(409);
    });
  });

  // -------------------------------------------------------------------
  // Lessons -- nested under /courses/:courseSlug/lessons
  // -------------------------------------------------------------------

  describe('lessons', () => {
    async function createCourse() {
      const res = await app.inject({
        method: 'POST',
        url: '/courses',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'options-101', title: 'Options 101', description: 'Intro.' },
      });
      return res.json();
    }

    it('every lesson route 404s for an unknown course slug', async () => {
      const list = await app.inject({ method: 'GET', url: '/courses/nope/lessons' });
      expect(list.statusCode).toBe(404);
      const create = await app.inject({
        method: 'POST',
        url: '/courses/nope/lessons',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'l1', title: 'Lesson 1', content: 'Content.' },
      });
      expect(create.statusCode).toBe(404);
    });

    it('full lifecycle scoped to a parent course', async () => {
      await createCourse();

      const create = await app.inject({
        method: 'POST',
        url: '/courses/options-101/lessons',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'intro', title: 'Introduction', content: 'What are options?' },
      });
      expect(create.statusCode).toBe(201);
      // courseId is resolved server-side from :courseSlug, never taken from
      // the request body (createLessonSchema has no courseId field at all).
      expect(create.json().courseId).toBe((await courseRepo.getBySlug('options-101'))!.id);

      const get = await app.inject({ method: 'GET', url: '/courses/options-101/lessons/intro' });
      expect(get.statusCode).toBe(200);

      const list = await app.inject({ method: 'GET', url: '/courses/options-101/lessons' });
      expect(list.json()).toHaveLength(1);

      const patch = await app.inject({
        method: 'PATCH',
        url: '/courses/options-101/lessons/intro',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { title: 'Introduction (updated)' },
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().title).toBe('Introduction (updated)');

      const del = await app.inject({
        method: 'DELETE',
        url: '/courses/options-101/lessons/intro',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(del.statusCode).toBe(204);
    });
  });

  // -------------------------------------------------------------------
  // Strategies
  // -------------------------------------------------------------------

  describe('strategies', () => {
    it('full lifecycle: create, get, list, patch, delete', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/strategies',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'iron-condor', name: 'Iron Condor', description: 'A defined-risk options strategy.' },
      });
      expect(create.statusCode).toBe(201);

      const patch = await app.inject({
        method: 'PATCH',
        url: '/strategies/iron-condor',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'published' },
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().status).toBe('published');

      const del = await app.inject({
        method: 'DELETE',
        url: '/strategies/iron-condor',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(del.statusCode).toBe(204);
    });
  });

  // -------------------------------------------------------------------
  // Quizzes & questions
  // -------------------------------------------------------------------

  describe('quizzes & questions', () => {
    async function createQuiz(slug = 'quiz-a') {
      const res = await app.inject({
        method: 'POST',
        url: '/quizzes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug, title: 'Quiz A' },
      });
      return res.json();
    }

    it('creates a quiz and lists it', async () => {
      const create = await app.inject({
        method: 'POST',
        url: '/quizzes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'quiz-a', title: 'Quiz A' },
      });
      expect(create.statusCode).toBe(201);
      const list = await app.inject({ method: 'GET', url: '/quizzes' });
      expect(list.json()).toHaveLength(1);
    });

    it('POST /quizzes/:slug/questions rejects an out-of-range correctOptionIndex with 400', async () => {
      await createQuiz();
      const res = await app.inject({
        method: 'POST',
        url: '/quizzes/quiz-a/questions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { question: 'What is a call option?', options: ['A', 'B'], correctOptionIndex: 5 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /quizzes/:slug/questions redacts the answer key; GET .../answer-key does not', async () => {
      await createQuiz();
      await app.inject({
        method: 'POST',
        url: '/quizzes/quiz-a/questions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          question: 'What is a call option?',
          options: ['Right to buy', 'Right to sell'],
          correctOptionIndex: 0,
          explanation: 'A call gives the right to buy.',
        },
      });

      const publicList = await app.inject({ method: 'GET', url: '/quizzes/quiz-a/questions' });
      expect(publicList.statusCode).toBe(200);
      expect(publicList.json()[0].correctOptionIndex).toBeUndefined();
      expect(publicList.json()[0].explanation).toBeUndefined();

      const unauthedAnswerKey = await app.inject({ method: 'GET', url: '/quizzes/quiz-a/answer-key' });
      expect(unauthedAnswerKey.statusCode).toBe(401);

      const nonAdminAnswerKey = await app.inject({
        method: 'GET',
        url: '/quizzes/quiz-a/answer-key',
        headers: { authorization: `Bearer ${traderToken}` },
      });
      expect(nonAdminAnswerKey.statusCode).toBe(403);

      const answerKey = await app.inject({
        method: 'GET',
        url: '/quizzes/quiz-a/answer-key',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(answerKey.statusCode).toBe(200);
      expect(answerKey.json()[0].correctOptionIndex).toBe(0);
      expect(answerKey.json()[0].explanation).toBe('A call gives the right to buy.');
    });

    it('POST /quizzes/:slug/questions rejects a duplicate orderIndex with 409', async () => {
      await createQuiz();
      const payload = { question: 'Q1', options: ['A', 'B'], correctOptionIndex: 0, orderIndex: 0 };
      await app.inject({ method: 'POST', url: '/quizzes/quiz-a/questions', headers: { authorization: `Bearer ${adminToken}` }, payload });
      const res = await app.inject({
        method: 'POST',
        url: '/quizzes/quiz-a/questions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ...payload, question: 'Q2' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('PATCH/DELETE a question refuse to act through a different quiz\'s URL (404)', async () => {
      await createQuiz('quiz-a');
      await createQuiz('quiz-b');
      const created = await app.inject({
        method: 'POST',
        url: '/quizzes/quiz-a/questions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { question: 'Q1', options: ['A', 'B'], correctOptionIndex: 0 },
      });
      const questionId = created.json().id;

      // Same question id, but reached through quiz-b's URL -- must not be
      // editable/deletable there even though quizQuestionRepo.update()/
      // remove() operate on the raw id regardless of quiz (see app.ts's
      // ownership-check comment above these two routes).
      const patch = await app.inject({
        method: 'PATCH',
        url: `/quizzes/quiz-b/questions/${questionId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { question: 'Hijacked' },
      });
      expect(patch.statusCode).toBe(404);

      const del = await app.inject({
        method: 'DELETE',
        url: `/quizzes/quiz-b/questions/${questionId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(del.statusCode).toBe(404);

      // The correct URL still works.
      const correctPatch = await app.inject({
        method: 'PATCH',
        url: `/quizzes/quiz-a/questions/${questionId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { question: 'Updated question text' },
      });
      expect(correctPatch.statusCode).toBe(200);
      expect(correctPatch.json().question).toBe('Updated question text');
    });
  });

  // -------------------------------------------------------------------
  // Quiz attempts -- userId always from the verified JWT
  // -------------------------------------------------------------------

  describe('quiz attempts', () => {
    async function setUpQuizWithTwoQuestions() {
      await app.inject({
        method: 'POST',
        url: '/quizzes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { slug: 'quiz-a', title: 'Quiz A' },
      });
      const q1 = await app.inject({
        method: 'POST',
        url: '/quizzes/quiz-a/questions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { question: 'Q1', options: ['A', 'B'], correctOptionIndex: 0, orderIndex: 0 },
      });
      const q2 = await app.inject({
        method: 'POST',
        url: '/quizzes/quiz-a/questions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { question: 'Q2', options: ['A', 'B'], correctOptionIndex: 1, orderIndex: 1 },
      });
      return { q1: q1.json(), q2: q2.json() };
    }

    it('scores a submission correctly and attributes it to the caller from the JWT', async () => {
      const { q1, q2 } = await setUpQuizWithTwoQuestions();
      const res = await app.inject({
        method: 'POST',
        url: '/quizzes/quiz-a/attempts',
        headers: { authorization: `Bearer ${traderToken}` },
        payload: {
          answers: [
            { questionId: q1.id, selectedOptionIndex: 0 }, // correct
            { questionId: q2.id, selectedOptionIndex: 0 }, // incorrect (correct is 1)
          ],
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().score).toBe(1);
      expect(res.json().totalQuestions).toBe(2);
      expect(res.json().userId).toBe('trader-1');

      const attempts = await app.inject({
        method: 'GET',
        url: '/quizzes/quiz-a/attempts',
        headers: { authorization: `Bearer ${traderToken}` },
      });
      expect(attempts.json()).toHaveLength(1);

      const allAttempts = await app.inject({
        method: 'GET',
        url: '/attempts',
        headers: { authorization: `Bearer ${traderToken}` },
      });
      expect(allAttempts.json()).toHaveLength(1);
    });

    it('rejects an answer-count mismatch with 400', async () => {
      const { q1 } = await setUpQuizWithTwoQuestions();
      const res = await app.inject({
        method: 'POST',
        url: '/quizzes/quiz-a/attempts',
        headers: { authorization: `Bearer ${traderToken}` },
        payload: { answers: [{ questionId: q1.id, selectedOptionIndex: 0 }] },
      });
      expect(res.statusCode).toBe(400);
    });

    it('requires auth (401 without a token)', async () => {
      await setUpQuizWithTwoQuestions();
      const res = await app.inject({ method: 'POST', url: '/quizzes/quiz-a/attempts', payload: { answers: [] } });
      expect(res.statusCode).toBe(401);
    });

    it('404s for an unknown quiz slug', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/quizzes/does-not-exist/attempts',
        headers: { authorization: `Bearer ${traderToken}` },
        payload: { answers: [{ questionId: '00000000-0000-0000-0000-000000000000', selectedOptionIndex: 0 }] },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // -------------------------------------------------------------------
  // Content tags (polymorphic)
  // -------------------------------------------------------------------

  describe('content tags', () => {
    it('attach, list, and detach a tag on a course', async () => {
      const course = await (
        await app.inject({
          method: 'POST',
          url: '/courses',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { slug: 'options-101', title: 'Options 101', description: 'Intro.' },
        })
      ).json();
      const tag = await (
        await app.inject({
          method: 'POST',
          url: '/tags',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { slug: 'beginner', name: 'Beginner' },
        })
      ).json();

      const attach = await app.inject({
        method: 'POST',
        url: `/content/course/${course.id}/tags`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { tagId: tag.id },
      });
      expect(attach.statusCode).toBe(204);

      const dup = await app.inject({
        method: 'POST',
        url: `/content/course/${course.id}/tags`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { tagId: tag.id },
      });
      expect(dup.statusCode).toBe(409);

      const list = await app.inject({ method: 'GET', url: `/content/course/${course.id}/tags` });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toHaveLength(1);
      expect(list.json()[0].slug).toBe('beginner');

      const detach = await app.inject({
        method: 'DELETE',
        url: `/content/course/${course.id}/tags/${tag.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(detach.statusCode).toBe(204);

      const afterDetach = await app.inject({ method: 'GET', url: `/content/course/${course.id}/tags` });
      expect(afterDetach.json()).toEqual([]);
    });

    it('rejects an invalid contentType with 400', async () => {
      const res = await app.inject({ method: 'GET', url: '/content/not-a-real-type/00000000-0000-0000-0000-000000000000/tags' });
      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------
  // Revisions -- admin-only
  // -------------------------------------------------------------------

  describe('revisions', () => {
    it('is admin-only (403 for a trader) and records a snapshot on update', async () => {
      const course = await (
        await app.inject({
          method: 'POST',
          url: '/courses',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { slug: 'options-101', title: 'Options 101', description: 'Intro.' },
        })
      ).json();

      const forbidden = await app.inject({
        method: 'GET',
        url: `/content/course/${course.id}/revisions`,
        headers: { authorization: `Bearer ${traderToken}` },
      });
      expect(forbidden.statusCode).toBe(403);

      await app.inject({
        method: 'PATCH',
        url: '/courses/options-101',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { title: 'Options 101 (revised)' },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/content/course/${course.id}/revisions`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
      expect(res.json()[0].editedBy).toBe('admin-1');
    });
  });

  // -------------------------------------------------------------------
  // Per-user progress
  // -------------------------------------------------------------------

  describe('progress', () => {
    it('requires auth and always attributes progress to the caller from the JWT', async () => {
      const course = await (
        await app.inject({
          method: 'POST',
          url: '/courses',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { slug: 'options-101', title: 'Options 101', description: 'Intro.' },
        })
      ).json();

      const unauthed = await app.inject({
        method: 'PUT',
        url: `/progress/course/${course.id}`,
        payload: { status: 'in_progress', progressPct: 40 },
      });
      expect(unauthed.statusCode).toBe(401);

      const put = await app.inject({
        method: 'PUT',
        url: `/progress/course/${course.id}`,
        headers: { authorization: `Bearer ${traderToken}` },
        payload: { status: 'in_progress', progressPct: 40 },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json().userId).toBe('trader-1');

      const list = await app.inject({
        method: 'GET',
        url: '/progress',
        headers: { authorization: `Bearer ${traderToken}` },
      });
      expect(list.json()).toHaveLength(1);
      expect(list.json()[0].progressPct).toBe(40);
    });
  });

  // -------------------------------------------------------------------
  // Task 7.3 -- AI tutor. Task 7.4 -- standalone trade-idea annotation.
  // -------------------------------------------------------------------

  describe('tutor & annotation', () => {
    const opinion = {
      expert: 'technical' as const,
      verdict: 'bullish' as const,
      confidence: 72,
      reasoning: ['RSI is oversold and turning up.'],
      generatedAtIso: new Date().toISOString(),
    };

    it('POST /tutor/explain requires auth but accepts any role', async () => {
      const unauthed = await app.inject({ method: 'POST', url: '/tutor/explain', payload: { opinions: [opinion] } });
      expect(unauthed.statusCode).toBe(401);

      const res = await app.inject({
        method: 'POST',
        url: '/tutor/explain',
        headers: { authorization: `Bearer ${traderToken}` },
        payload: { opinions: [opinion] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().expert).toBe('education');
      expect(Array.isArray(res.json().reasoning)).toBe(true);
      expect(res.json().reasoning.length).toBeGreaterThan(0);
    });

    it('POST /tutor/explain accepts an empty opinions array (EducationAgent returns a neutral fallback)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tutor/explain',
        headers: { authorization: `Bearer ${traderToken}` },
        payload: { opinions: [] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().reasoning.length).toBeGreaterThan(0);
    });

    it('POST /tutor/explain rejects a malformed opinion with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/tutor/explain',
        headers: { authorization: `Bearer ${traderToken}` },
        payload: { opinions: [{ ...opinion, confidence: 150 }] },
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST /annotations/trade-idea is admin-only', async () => {
      const tradeIdea = {
        symbol: 'AAPL',
        direction: 'long' as const,
        entry: 200,
        stopLoss: 195,
        target: 215,
        riskRewardRatio: 3,
      };

      const forbidden = await app.inject({
        method: 'POST',
        url: '/annotations/trade-idea',
        headers: { authorization: `Bearer ${traderToken}` },
        payload: { tradeIdea, opinions: [opinion] },
      });
      expect(forbidden.statusCode).toBe(403);

      const res = await app.inject({
        method: 'POST',
        url: '/annotations/trade-idea',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { tradeIdea, opinions: [opinion] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().symbol).toBe('AAPL');
      expect(typeof res.json().educationNote).toBe('string');
      expect(res.json().educationNote.length).toBeGreaterThan(0);
    });
  });
});
