import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Logger } from '@tradosphere/logger';
import { verifyAccessToken, InvalidTokenError, requireRole, ForbiddenError, type Role } from '@tradosphere/auth';
import type { Course, Quiz, QuizQuestion } from '@tradosphere/database';
import type {
  CategoryRepository,
  TagRepository,
  GlossaryRepository,
  CourseRepository,
  LessonRepository,
  StrategyRepository,
  QuizRepository,
  QuizQuestionRepository,
  ContentTagRepository,
  RevisionRepository,
  ProgressRepository,
  QuizAttemptRepository,
} from './repository';
import { NotFoundError, SlugInUseError, DuplicateError, AnswerCountMismatchError } from './errors';
import { submitQuizAttempt } from './quiz-scoring';
import { explainOpinions } from './tutor';
import { annotateTradeIdea } from './annotate';
import {
  validateBody,
  createCategorySchema,
  createTagSchema,
  createGlossaryTermSchema,
  updateGlossaryTermSchema,
  glossaryFilterSchema,
  createCourseSchema,
  updateCourseSchema,
  courseFilterSchema,
  createLessonSchema,
  updateLessonSchema,
  lessonFilterSchema,
  createStrategySchema,
  updateStrategySchema,
  strategyFilterSchema,
  createQuizSchema,
  updateQuizSchema,
  quizFilterSchema,
  createQuizQuestionSchema,
  updateQuizQuestionSchema,
  attachTagSchema,
  contentTypeParamSchema,
  detachTagParamSchema,
  idParamSchema,
  upsertProgressSchema,
  submitQuizAttemptSchema,
  tutorExplainSchema,
  annotateTradeIdeaSchema,
} from './validation';

// Task 7.1: the Fastify app for services/education. Route surface mirrors
// repository.ts's own section order (categories/tags, glossary, courses,
// lessons, strategies, quizzes/questions, content tags, revisions,
// progress, quiz attempts), plus tutor.ts/annotate.ts's two AI routes.
//
// Auth model (Cipher's charter rule 2: auth-required is the default, public
// is a justified exception) -- decided once, applied uniformly below:
//   - All GET/list/detail routes on the five content types + categories/tags
//     + public quiz questions are UNauthenticated. This is learner-facing
//     course/glossary/strategy/quiz content, the justified public exception.
//   - Every mutation (create/update/delete/attach/detach) requires
//     requireAuth + requireRole('admin') -- content authoring is an admin
//     action in this sprint; there is no per-author-ownership model yet.
//   - Progress and quiz-attempt endpoints require requireAuth (any role),
//     with userId always taken from the verified JWT (request.authUser.sub),
//     never trusted from the request body -- a caller can never write
//     progress or a quiz score as a different user.
//   - The quiz answer key (GET /quizzes/:slug/answer-key) is admin-only:
//     the plain question list (GET /quizzes/:slug/questions) is public but
//     redacted (see toPublicQuestion below) so a learner can browse/take a
//     quiz without the correct answers being readable straight off the wire.
//   - POST /tutor/explain requires requireAuth (any role) -- it's a
//     learner-facing explain action, not a content-authoring one.
//   - POST /annotations/trade-idea requires requireAuth + requireRole('admin')
//     -- per D12 this is a standalone capability proof for Sprint 7, not
//     wired into services/cio's pipeline, so gating it the same as content
//     mutation (rather than opening it to any authenticated user) keeps its
//     blast radius as small as the rest of the unwired capability.

export interface AppDeps {
  categoryRepo: CategoryRepository;
  tagRepo: TagRepository;
  glossaryRepo: GlossaryRepository;
  courseRepo: CourseRepository;
  lessonRepo: LessonRepository;
  strategyRepo: StrategyRepository;
  quizRepo: QuizRepository;
  quizQuestionRepo: QuizQuestionRepository;
  contentTagRepo: ContentTagRepository;
  revisionRepo: RevisionRepository;
  progressRepo: ProgressRepository;
  quizAttemptRepo: QuizAttemptRepository;
  jwtSecret: string;
  logger: Logger;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: { sub: string; role: Role };
  }
}

// Identical shape to services/auth/src/app.ts's requireAuth -- same JWT,
// same verifyAccessToken/InvalidTokenError contract from @tradosphere/auth.
function requireAuth(deps: AppDeps) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing bearer token' });
    }
    const token = header.slice('Bearer '.length);
    try {
      request.authUser = verifyAccessToken(token, deps.jwtSecret);
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        return reply.code(401).send({ error: err.message });
      }
      throw err;
    }
  };
}

// Chained after requireAuth (never standalone -- relies on request.authUser
// already being set), so every "admin" route below composes both as a
// preHandler array: [requireAuth(deps), requireAdminRole()].
function requireAdminRole() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      requireRole(request.authUser!.role, 'admin');
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return reply.code(403).send({ error: err.message });
      }
      throw err;
    }
  };
}

// Strips the answer key (correctOptionIndex, explanation) from a quiz
// question before it goes out over the public, unauthenticated
// GET /quizzes/:slug/questions route -- a learner taking the quiz can see
// what's being asked, never the correct index. The full row (used by admin
// content tooling) is served separately by GET /quizzes/:slug/answer-key.
function toPublicQuestion(q: QuizQuestion) {
  return {
    id: q.id,
    quizId: q.quizId,
    question: q.question,
    options: q.options,
    orderIndex: q.orderIndex,
  };
}

// The only place this service builds its HTTP surface -- index.ts just
// supplies real dependencies (drizzle repos, a real pg Pool) and calls
// listen(). Tests supply in-memory repos (test/fakes.ts) and call
// app.inject() instead, so every route below is covered without a real
// Postgres or open port. No @fastify/rate-limit plugin here (unlike
// services/auth) -- Sprint 7's task list has no rate-limiting task for this
// service, and package.json deliberately omits the dependency; adding a
// second, half-configured rate limiter here would be scope creep, not
// hardening.
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify's FastifyBaseLogger typing doesn't structurally match a real
    // pino instance byte-for-byte even though pino is Fastify's own default
    // logger -- same cast, same reasoning as services/auth/src/app.ts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
    logger: deps.logger as any,
    genReqId: () => randomUUID(),
  });

  const authed = requireAuth(deps);
  const adminOnly = [requireAuth(deps), requireAdminRole()];

  // Resolves a course by its slug or replies 404 and returns undefined --
  // every lesson route is nested under /courses/:courseSlug/lessons and
  // needs the course's real id (lessons.course_id is a UUID FK), never the
  // slug, to call lessonRepo.
  async function resolveCourseOrReply(courseSlug: string, reply: FastifyReply): Promise<Course | undefined> {
    const course = await deps.courseRepo.getBySlug(courseSlug);
    if (!course) {
      await reply.code(404).send({ error: `course not found: ${courseSlug}` });
      return undefined;
    }
    return course;
  }

  // Same pattern for quizzes -- quiz questions are addressed by their own
  // UUID (they have no slug column), but every quiz-question route is
  // reached through /quizzes/:slug/..., so the slug is resolved to the
  // quiz's real id first.
  async function resolveQuizOrReply(slug: string, reply: FastifyReply): Promise<Quiz | undefined> {
    const quiz = await deps.quizRepo.getBySlug(slug);
    if (!quiz) {
      await reply.code(404).send({ error: `quiz not found: ${slug}` });
      return undefined;
    }
    return quiz;
  }

  // ---------------------------------------------------------------------
  // Categories & tags
  // ---------------------------------------------------------------------

  app.get('/categories', async (_request, reply) => {
    return reply.send(await deps.categoryRepo.list());
  });

  app.post('/categories', { preHandler: adminOnly }, async (request, reply) => {
    const validation = validateBody(createCategorySchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    try {
      const row = await deps.categoryRepo.create(validation.data);
      return reply.code(201).send(row);
    } catch (err) {
      if (err instanceof SlugInUseError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  app.get('/tags', async (_request, reply) => {
    return reply.send(await deps.tagRepo.list());
  });

  app.post('/tags', { preHandler: adminOnly }, async (request, reply) => {
    const validation = validateBody(createTagSchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    try {
      const row = await deps.tagRepo.create(validation.data);
      return reply.code(201).send(row);
    } catch (err) {
      if (err instanceof SlugInUseError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  // ---------------------------------------------------------------------
  // Glossary
  // ---------------------------------------------------------------------

  app.get('/glossary', async (request, reply) => {
    const validation = validateBody(glossaryFilterSchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(await deps.glossaryRepo.list(validation.data));
  });

  app.get<{ Params: { slug: string } }>('/glossary/:slug', async (request, reply) => {
    const row = await deps.glossaryRepo.getBySlug(request.params.slug);
    if (!row) return reply.code(404).send({ error: `glossary term not found: ${request.params.slug}` });
    return reply.send(row);
  });

  app.post('/glossary', { preHandler: adminOnly }, async (request, reply) => {
    const validation = validateBody(createGlossaryTermSchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    try {
      const row = await deps.glossaryRepo.create({ ...validation.data, createdBy: request.authUser!.sub });
      return reply.code(201).send(row);
    } catch (err) {
      if (err instanceof SlugInUseError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  app.patch<{ Params: { slug: string } }>('/glossary/:slug', { preHandler: adminOnly }, async (request, reply) => {
    const validation = validateBody(updateGlossaryTermSchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    try {
      const row = await deps.glossaryRepo.update(request.params.slug, validation.data, request.authUser!.sub);
      return reply.send(row);
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
      throw err;
    }
  });

  app.delete<{ Params: { slug: string } }>('/glossary/:slug', { preHandler: adminOnly }, async (request, reply) => {
    await deps.glossaryRepo.remove(request.params.slug);
    return reply.code(204).send();
  });

  // ---------------------------------------------------------------------
  // Courses
  // ---------------------------------------------------------------------

  app.get('/courses', async (request, reply) => {
    const validation = validateBody(courseFilterSchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(await deps.courseRepo.list(validation.data));
  });

  app.get<{ Params: { slug: string } }>('/courses/:slug', async (request, reply) => {
    const row = await deps.courseRepo.getBySlug(request.params.slug);
    if (!row) return reply.code(404).send({ error: `course not found: ${request.params.slug}` });
    return reply.send(row);
  });

  app.post('/courses', { preHandler: adminOnly }, async (request, reply) => {
    const validation = validateBody(createCourseSchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    try {
      const row = await deps.courseRepo.create({ ...validation.data, createdBy: request.authUser!.sub });
      return reply.code(201).send(row);
    } catch (err) {
      if (err instanceof SlugInUseError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  app.patch<{ Params: { slug: string } }>('/courses/:slug', { preHandler: adminOnly }, async (request, reply) => {
    const validation = validateBody(updateCourseSchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    try {
      const row = await deps.courseRepo.update(request.params.slug, validation.data, request.authUser!.sub);
      return reply.send(row);
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
      throw err;
    }
  });

  app.delete<{ Params: { slug: string } }>('/courses/:slug', { preHandler: adminOnly }, async (request, reply) => {
    await deps.courseRepo.remove(request.params.slug);
    return reply.code(204).send();
  });

  // ---------------------------------------------------------------------
  // Lessons -- nested under /courses/:courseSlug/lessons
  // ---------------------------------------------------------------------

  app.get<{ Params: { courseSlug: string } }>('/courses/:courseSlug/lessons', async (request, reply) => {
    const course = await resolveCourseOrReply(request.params.courseSlug, reply);
    if (!course) return;
    const validation = validateBody(lessonFilterSchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(await deps.lessonRepo.listByCourse(course.id, validation.data));
  });

  app.get<{ Params: { courseSlug: string; slug: string } }>(
    '/courses/:courseSlug/lessons/:slug',
    async (request, reply) => {
      const course = await resolveCourseOrReply(request.params.courseSlug, reply);
      if (!course) return;
      const row = await deps.lessonRepo.getBySlug(course.id, request.params.slug);
      if (!row) return reply.code(404).send({ error: `lesson not found: ${request.params.slug}` });
      return reply.send(row);
    },
  );

  app.post<{ Params: { courseSlug: string } }>(
    '/courses/:courseSlug/lessons',
    { preHandler: adminOnly },
    async (request, reply) => {
      const course = await resolveCourseOrReply(request.params.courseSlug, reply);
      if (!course) return;
      const validation = validateBody(createLessonSchema, request.body);
      if (!validation.success) return reply.code(400).send(validation.failure);
      try {
        const row = await deps.lessonRepo.create({
          ...validation.data,
          courseId: course.id,
          createdBy: request.authUser!.sub,
        });
        return reply.code(201).send(row);
      } catch (err) {
        if (err instanceof SlugInUseError) return reply.code(409).send({ error: err.message });
        throw err;
      }
    },
  );

  app.patch<{ Params: { courseSlug: string; slug: string } }>(
    '/courses/:courseSlug/lessons/:slug',
    { preHandler: adminOnly },
    async (request, reply) => {
      const course = await resolveCourseOrReply(request.params.courseSlug, reply);
      if (!course) return;
      const validation = validateBody(updateLessonSchema, request.body);
      if (!validation.success) return reply.code(400).send(validation.failure);
      try {
        const row = await deps.lessonRepo.update(course.id, request.params.slug, validation.data, request.authUser!.sub);
        return reply.send(row);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
        throw err;
      }
    },
  );

  app.delete<{ Params: { courseSlug: string; slug: string } }>(
    '/courses/:courseSlug/lessons/:slug',
    { preHandler: adminOnly },
    async (request, reply) => {
      const course = await resolveCourseOrReply(request.params.courseSlug, reply);
      if (!course) return;
      await deps.lessonRepo.remove(course.id, request.params.slug);
      return reply.code(204).send();
    },
  );

  // ---------------------------------------------------------------------
  // Strategies
  // ---------------------------------------------------------------------

  app.get('/strategies', async (request, reply) => {
    const validation = validateBody(strategyFilterSchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(await deps.strategyRepo.list(validation.data));
  });

  app.get<{ Params: { slug: string } }>('/strategies/:slug', async (request, reply) => {
    const row = await deps.strategyRepo.getBySlug(request.params.slug);
    if (!row) return reply.code(404).send({ error: `strategy not found: ${request.params.slug}` });
    return reply.send(row);
  });

  app.post('/strategies', { preHandler: adminOnly }, async (request, reply) => {
    const validation = validateBody(createStrategySchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    try {
      const row = await deps.strategyRepo.create({ ...validation.data, createdBy: request.authUser!.sub });
      return reply.code(201).send(row);
    } catch (err) {
      if (err instanceof SlugInUseError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  app.patch<{ Params: { slug: string } }>('/strategies/:slug', { preHandler: adminOnly }, async (request, reply) => {
    const validation = validateBody(updateStrategySchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    try {
      const row = await deps.strategyRepo.update(request.params.slug, validation.data, request.authUser!.sub);
      return reply.send(row);
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
      throw err;
    }
  });

  app.delete<{ Params: { slug: string } }>('/strategies/:slug', { preHandler: adminOnly }, async (request, reply) => {
    await deps.strategyRepo.remove(request.params.slug);
    return reply.code(204).send();
  });

  // ---------------------------------------------------------------------
  // Quizzes
  // ---------------------------------------------------------------------

  app.get('/quizzes', async (request, reply) => {
    const validation = validateBody(quizFilterSchema, request.query);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(await deps.quizRepo.list(validation.data));
  });

  app.get<{ Params: { slug: string } }>('/quizzes/:slug', async (request, reply) => {
    const row = await deps.quizRepo.getBySlug(request.params.slug);
    if (!row) return reply.code(404).send({ error: `quiz not found: ${request.params.slug}` });
    return reply.send(row);
  });

  app.post('/quizzes', { preHandler: adminOnly }, async (request, reply) => {
    const validation = validateBody(createQuizSchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    try {
      const row = await deps.quizRepo.create({ ...validation.data, createdBy: request.authUser!.sub });
      return reply.code(201).send(row);
    } catch (err) {
      if (err instanceof SlugInUseError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  app.patch<{ Params: { slug: string } }>('/quizzes/:slug', { preHandler: adminOnly }, async (request, reply) => {
    const validation = validateBody(updateQuizSchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    try {
      const row = await deps.quizRepo.update(request.params.slug, validation.data, request.authUser!.sub);
      return reply.send(row);
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
      throw err;
    }
  });

  app.delete<{ Params: { slug: string } }>('/quizzes/:slug', { preHandler: adminOnly }, async (request, reply) => {
    await deps.quizRepo.remove(request.params.slug);
    return reply.code(204).send();
  });

  // Public, redacted -- see toPublicQuestion's comment above.
  app.get<{ Params: { slug: string } }>('/quizzes/:slug/questions', async (request, reply) => {
    const quiz = await resolveQuizOrReply(request.params.slug, reply);
    if (!quiz) return;
    const questions = await deps.quizQuestionRepo.listByQuiz(quiz.id);
    return reply.send(questions.map(toPublicQuestion));
  });

  // Admin-only, full rows including correctOptionIndex/explanation.
  app.get<{ Params: { slug: string } }>(
    '/quizzes/:slug/answer-key',
    { preHandler: adminOnly },
    async (request, reply) => {
      const quiz = await resolveQuizOrReply(request.params.slug, reply);
      if (!quiz) return;
      return reply.send(await deps.quizQuestionRepo.listByQuiz(quiz.id));
    },
  );

  app.post<{ Params: { slug: string } }>(
    '/quizzes/:slug/questions',
    { preHandler: adminOnly },
    async (request, reply) => {
      const quiz = await resolveQuizOrReply(request.params.slug, reply);
      if (!quiz) return;
      const validation = validateBody(createQuizQuestionSchema, request.body);
      if (!validation.success) return reply.code(400).send(validation.failure);
      try {
        const row = await deps.quizQuestionRepo.create({ ...validation.data, quizId: quiz.id });
        return reply.code(201).send(row);
      } catch (err) {
        if (err instanceof DuplicateError) return reply.code(409).send({ error: err.message });
        throw err;
      }
    },
  );

  // PATCH/DELETE both re-verify the question actually belongs to the quiz
  // named in the URL (via listByQuiz) before touching it, even though
  // quizQuestionRepo.update()/remove() operate on the question's own UUID
  // and would happily act on a question id copy-pasted from a different
  // quiz. Without this check the URL would lie about what it operates on --
  // /quizzes/quiz-a/questions/:id silently editing a quiz-b question.
  app.patch<{ Params: { slug: string; id: string } }>(
    '/quizzes/:slug/questions/:id',
    { preHandler: adminOnly },
    async (request, reply) => {
      const idValidation = validateBody(idParamSchema, request.params);
      if (!idValidation.success) return reply.code(400).send(idValidation.failure);
      const quiz = await resolveQuizOrReply(request.params.slug, reply);
      if (!quiz) return;
      const existing = await deps.quizQuestionRepo.listByQuiz(quiz.id);
      if (!existing.some((q) => q.id === idValidation.data.id)) {
        return reply.code(404).send({ error: `quiz question not found on this quiz: ${idValidation.data.id}` });
      }
      const bodyValidation = validateBody(updateQuizQuestionSchema, request.body);
      if (!bodyValidation.success) return reply.code(400).send(bodyValidation.failure);
      try {
        const row = await deps.quizQuestionRepo.update(idValidation.data.id, bodyValidation.data);
        return reply.send(row);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
        throw err;
      }
    },
  );

  app.delete<{ Params: { slug: string; id: string } }>(
    '/quizzes/:slug/questions/:id',
    { preHandler: adminOnly },
    async (request, reply) => {
      const idValidation = validateBody(idParamSchema, request.params);
      if (!idValidation.success) return reply.code(400).send(idValidation.failure);
      const quiz = await resolveQuizOrReply(request.params.slug, reply);
      if (!quiz) return;
      const existing = await deps.quizQuestionRepo.listByQuiz(quiz.id);
      if (!existing.some((q) => q.id === idValidation.data.id)) {
        return reply.code(404).send({ error: `quiz question not found on this quiz: ${idValidation.data.id}` });
      }
      await deps.quizQuestionRepo.remove(idValidation.data.id);
      return reply.code(204).send();
    },
  );

  // ---------------------------------------------------------------------
  // Quiz attempts -- userId always from the verified JWT, never the body.
  // ---------------------------------------------------------------------

  app.post<{ Params: { slug: string } }>(
    '/quizzes/:slug/attempts',
    { preHandler: authed },
    async (request, reply) => {
      const quiz = await resolveQuizOrReply(request.params.slug, reply);
      if (!quiz) return;
      const validation = validateBody(submitQuizAttemptSchema, request.body);
      if (!validation.success) return reply.code(400).send(validation.failure);
      try {
        const attempt = await submitQuizAttempt(
          { quizQuestionRepo: deps.quizQuestionRepo, quizAttemptRepo: deps.quizAttemptRepo },
          { userId: request.authUser!.sub, quizId: quiz.id, answers: validation.data.answers },
        );
        return reply.code(201).send(attempt);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
        if (err instanceof AnswerCountMismatchError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    },
  );

  app.get<{ Params: { slug: string } }>('/quizzes/:slug/attempts', { preHandler: authed }, async (request, reply) => {
    const quiz = await resolveQuizOrReply(request.params.slug, reply);
    if (!quiz) return;
    return reply.send(await deps.quizAttemptRepo.listForUser(request.authUser!.sub, quiz.id));
  });

  app.get('/attempts', { preHandler: authed }, async (request, reply) => {
    return reply.send(await deps.quizAttemptRepo.listForUser(request.authUser!.sub));
  });

  // ---------------------------------------------------------------------
  // Content tags (polymorphic) & revisions
  // ---------------------------------------------------------------------

  app.get<{ Params: { contentType: string; contentId: string } }>(
    '/content/:contentType/:contentId/tags',
    async (request, reply) => {
      const validation = validateBody(contentTypeParamSchema, request.params);
      if (!validation.success) return reply.code(400).send(validation.failure);
      return reply.send(await deps.contentTagRepo.listForContent(validation.data.contentType, validation.data.contentId));
    },
  );

  app.post<{ Params: { contentType: string; contentId: string } }>(
    '/content/:contentType/:contentId/tags',
    { preHandler: adminOnly },
    async (request, reply) => {
      const paramsValidation = validateBody(contentTypeParamSchema, request.params);
      if (!paramsValidation.success) return reply.code(400).send(paramsValidation.failure);
      const bodyValidation = validateBody(attachTagSchema, request.body);
      if (!bodyValidation.success) return reply.code(400).send(bodyValidation.failure);
      try {
        await deps.contentTagRepo.attach(
          paramsValidation.data.contentType,
          paramsValidation.data.contentId,
          bodyValidation.data.tagId,
        );
        return reply.code(204).send();
      } catch (err) {
        if (err instanceof DuplicateError) return reply.code(409).send({ error: err.message });
        throw err;
      }
    },
  );

  app.delete<{ Params: { contentType: string; contentId: string; tagId: string } }>(
    '/content/:contentType/:contentId/tags/:tagId',
    { preHandler: adminOnly },
    async (request, reply) => {
      const validation = validateBody(detachTagParamSchema, request.params);
      if (!validation.success) return reply.code(400).send(validation.failure);
      await deps.contentTagRepo.detach(validation.data.contentType, validation.data.contentId, validation.data.tagId);
      return reply.code(204).send();
    },
  );

  // Admin-only by default (Cipher's charter rule 2) -- revision history
  // carries editedBy user ids and isn't part of the learner-facing content
  // surface, so it doesn't qualify for the public-read exception the five
  // content types get.
  app.get<{ Params: { contentType: string; contentId: string } }>(
    '/content/:contentType/:contentId/revisions',
    { preHandler: adminOnly },
    async (request, reply) => {
      const validation = validateBody(contentTypeParamSchema, request.params);
      if (!validation.success) return reply.code(400).send(validation.failure);
      return reply.send(await deps.revisionRepo.listForContent(validation.data.contentType, validation.data.contentId));
    },
  );

  // ---------------------------------------------------------------------
  // Per-user progress -- userId always from the verified JWT.
  // ---------------------------------------------------------------------

  app.put<{ Params: { contentType: string; contentId: string } }>(
    '/progress/:contentType/:contentId',
    { preHandler: authed },
    async (request, reply) => {
      const paramsValidation = validateBody(contentTypeParamSchema, request.params);
      if (!paramsValidation.success) return reply.code(400).send(paramsValidation.failure);
      const bodyValidation = validateBody(upsertProgressSchema, request.body);
      if (!bodyValidation.success) return reply.code(400).send(bodyValidation.failure);
      const row = await deps.progressRepo.upsert({
        userId: request.authUser!.sub,
        contentType: paramsValidation.data.contentType,
        contentId: paramsValidation.data.contentId,
        status: bodyValidation.data.status,
        progressPct: bodyValidation.data.progressPct,
      });
      return reply.send(row);
    },
  );

  app.get('/progress', { preHandler: authed }, async (request, reply) => {
    return reply.send(await deps.progressRepo.listForUser(request.authUser!.sub));
  });

  // ---------------------------------------------------------------------
  // Task 7.3 -- AI tutor. Task 7.4 -- standalone trade-idea annotation
  // (per D12, deliberately not called from anywhere in services/cio).
  // ---------------------------------------------------------------------

  app.post('/tutor/explain', { preHandler: authed }, async (request, reply) => {
    const validation = validateBody(tutorExplainSchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(explainOpinions(validation.data));
  });

  app.post('/annotations/trade-idea', { preHandler: adminOnly }, async (request, reply) => {
    const validation = validateBody(annotateTradeIdeaSchema, request.body);
    if (!validation.success) return reply.code(400).send(validation.failure);
    return reply.send(annotateTradeIdea(validation.data));
  });

  app.setErrorHandler((err, request, reply) => {
    // Every domain error this service raises is already caught and replied
    // to locally in the route it belongs to (NotFoundError, SlugInUseError,
    // DuplicateError, AnswerCountMismatchError, InvalidTokenError inside
    // requireAuth, ForbiddenError inside requireAdminRole). Anything
    // reaching this point is genuinely unexpected, so it logs loudly and
    // returns a deliberately generic 500 with no internal detail leaked to
    // the client -- same contract as services/auth/src/app.ts's handler.
    request.log.error({ err }, 'unhandled error in education service');
    return reply.code(500).send({ error: 'internal server error' });
  });

  return app;
}
