import { z } from 'zod';

// Mirrors services/auth/src/validation.ts's shape and contract
// (ValidationResult/validateBody below are byte-for-byte the same pattern):
// every public route validates its body/params against one of these schemas
// before repository.ts/quiz-scoring.ts ever run, so those layers keep
// trusting their input shape exactly as-is. Kept as one file for the whole
// service rather than one per content type -- the five content repositories
// take near-identical create/update payloads, matching errors.ts's own
// per-kind-not-per-content-type reasoning.

const slug = z
  .string()
  .trim()
  .min(1, 'slug is required')
  .max(200, 'slug must be at most 200 characters')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase alphanumeric segments separated by hyphens');

const uuidField = (label: string) => z.string().uuid(`${label} must be a valid UUID`);

const shortText = (label: string, max = 300) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

const longText = (label: string, max = 50_000) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

// Unlike shortText/longText, an optional query-string search filter that is
// present-but-empty (e.g. `?search=`) should behave like "no filter" rather
// than a 400 -- so this intentionally has no .min(1).
const optionalSearch = z.string().trim().max(200).optional();

// Enum values below are hand-mirrored from packages/database/src/education-schema.ts's
// pgEnum definitions -- zod needs its own literal tuple (it can't import a
// runtime value out of a pgEnum), so this is the one place that duplicates
// them. If a new status/difficulty/source value is ever added to the schema,
// it must be added here too or the API will reject a value the DB would
// otherwise accept.
const contentStatus = z.enum(['draft', 'published', 'archived']);
const sourceType = z.enum(['human', 'ai_generated']);
const difficulty = z.enum(['beginner', 'intermediate', 'advanced']);
const contentType = z.enum(['glossary_term', 'course', 'lesson', 'strategy', 'quiz']);
const progressStatus = z.enum(['not_started', 'in_progress', 'completed']);
const orderIndex = z.number().int().min(0, 'orderIndex must be >= 0');
const progressPct = z.number().int().min(0).max(100, 'progressPct must be between 0 and 100');

// ---------------------------------------------------------------------------
// Categories & tags
// ---------------------------------------------------------------------------

export const createCategorySchema = z.object({
  slug,
  name: shortText('name', 200),
  description: shortText('description', 2000).optional(),
});
export type CreateCategoryBody = z.infer<typeof createCategorySchema>;

export const createTagSchema = z.object({
  slug,
  name: shortText('name', 100),
});
export type CreateTagBody = z.infer<typeof createTagSchema>;

// ---------------------------------------------------------------------------
// Glossary
// ---------------------------------------------------------------------------

export const createGlossaryTermSchema = z.object({
  slug,
  term: shortText('term', 200),
  definition: longText('definition'),
  categoryId: uuidField('categoryId').optional(),
  status: contentStatus.optional(),
  sourceType: sourceType.optional(),
});
export type CreateGlossaryTermBody = z.infer<typeof createGlossaryTermSchema>;

export const updateGlossaryTermSchema = createGlossaryTermSchema.omit({ slug: true }).partial();
export type UpdateGlossaryTermBody = z.infer<typeof updateGlossaryTermSchema>;

// GET /glossary query filter -- app.ts validates request.query against this
// the same way it validates a JSON body (validateBody() takes `unknown`).
// All fields optional since an empty filter means "list everything".
export const glossaryFilterSchema = z.object({
  categoryId: uuidField('categoryId').optional(),
  status: contentStatus.optional(),
  search: optionalSearch,
});
export type GlossaryFilterQuery = z.infer<typeof glossaryFilterSchema>;

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export const createCourseSchema = z.object({
  slug,
  title: shortText('title', 200),
  description: longText('description'),
  categoryId: uuidField('categoryId').optional(),
  difficulty: difficulty.optional(),
  status: contentStatus.optional(),
  sourceType: sourceType.optional(),
});
export type CreateCourseBody = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = createCourseSchema.omit({ slug: true }).partial();
export type UpdateCourseBody = z.infer<typeof updateCourseSchema>;

export const courseFilterSchema = z.object({
  categoryId: uuidField('categoryId').optional(),
  status: contentStatus.optional(),
  difficulty: difficulty.optional(),
  search: optionalSearch,
});
export type CourseFilterQuery = z.infer<typeof courseFilterSchema>;

// ---------------------------------------------------------------------------
// Lessons -- courseId is never part of the body. It's always resolved from
// the :courseSlug route param (app.ts nests lesson routes under
// /courses/:courseSlug/lessons, resolving the course row server-side before
// touching lessonRepo), so there is exactly one source of truth for which
// course a lesson belongs to, instead of a body field that could disagree
// with the URL it was posted to. :courseSlug rather than a raw :courseId
// keeps every URL in this service addressed by human-readable slug, the same
// as /courses/:slug, /glossary/:slug, /strategies/:slug, /quizzes/:slug.
// ---------------------------------------------------------------------------

export const createLessonSchema = z.object({
  slug,
  title: shortText('title', 200),
  content: longText('content'),
  orderIndex: orderIndex.optional(),
  status: contentStatus.optional(),
  sourceType: sourceType.optional(),
});
export type CreateLessonBody = z.infer<typeof createLessonSchema>;

export const updateLessonSchema = createLessonSchema.omit({ slug: true }).partial();
export type UpdateLessonBody = z.infer<typeof updateLessonSchema>;

// No categoryId/difficulty here -- same reasoning as LessonFilter in
// repository.ts: a lesson inherits both from its already-:courseSlug-scoped
// parent course.
export const lessonFilterSchema = z.object({
  status: contentStatus.optional(),
  search: optionalSearch,
});
export type LessonFilterQuery = z.infer<typeof lessonFilterSchema>;

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export const createStrategySchema = z.object({
  slug,
  name: shortText('name', 200),
  description: longText('description'),
  categoryId: uuidField('categoryId').optional(),
  difficulty: difficulty.optional(),
  status: contentStatus.optional(),
  sourceType: sourceType.optional(),
});
export type CreateStrategyBody = z.infer<typeof createStrategySchema>;

export const updateStrategySchema = createStrategySchema.omit({ slug: true }).partial();
export type UpdateStrategyBody = z.infer<typeof updateStrategySchema>;

export const strategyFilterSchema = z.object({
  categoryId: uuidField('categoryId').optional(),
  status: contentStatus.optional(),
  difficulty: difficulty.optional(),
  search: optionalSearch,
});
export type StrategyFilterQuery = z.infer<typeof strategyFilterSchema>;

// ---------------------------------------------------------------------------
// Quizzes & questions
// ---------------------------------------------------------------------------

export const createQuizSchema = z.object({
  slug,
  title: shortText('title', 200),
  courseId: uuidField('courseId').optional(),
  lessonId: uuidField('lessonId').optional(),
  status: contentStatus.optional(),
  sourceType: sourceType.optional(),
});
export type CreateQuizBody = z.infer<typeof createQuizSchema>;

export const updateQuizSchema = createQuizSchema.omit({ slug: true }).partial();
export type UpdateQuizBody = z.infer<typeof updateQuizSchema>;

export const quizFilterSchema = z.object({
  status: contentStatus.optional(),
  courseId: uuidField('courseId').optional(),
});
export type QuizFilterQuery = z.infer<typeof quizFilterSchema>;

const quizOptions = z
  .array(shortText('option', 500))
  .min(2, 'a question needs at least 2 options')
  .max(10, 'a question may have at most 10 options');

export const createQuizQuestionSchema = z
  .object({
    question: shortText('question', 1000),
    options: quizOptions,
    correctOptionIndex: z.number().int().min(0),
    explanation: shortText('explanation', 2000).optional(),
    orderIndex: orderIndex.optional(),
  })
  .refine((body) => body.correctOptionIndex < body.options.length, {
    message: 'correctOptionIndex must be a valid index into options',
    path: ['correctOptionIndex'],
  });
export type CreateQuizQuestionBody = z.infer<typeof createQuizQuestionSchema>;

// A plain z.object(...).refine() rather than createQuizQuestionSchema.partial()
// -- .refine() returns a ZodEffects, and ZodEffects has no .partial()/.omit()
// (refinement composes after the shape, so zod has nowhere to apply a partial
// transform to). The cross-field check below only fires when both fields are
// present in the same patch: an update touching just `options` or just
// `correctOptionIndex` alone is left to whichever create-time invariant is
// already stored.
export const updateQuizQuestionSchema = z
  .object({
    question: shortText('question', 1000).optional(),
    options: quizOptions.optional(),
    correctOptionIndex: z.number().int().min(0).optional(),
    explanation: shortText('explanation', 2000).optional(),
    orderIndex: orderIndex.optional(),
  })
  .refine(
    (body) =>
      body.correctOptionIndex === undefined || body.options === undefined || body.correctOptionIndex < body.options.length,
    { message: 'correctOptionIndex must be a valid index into options', path: ['correctOptionIndex'] },
  );
export type UpdateQuizQuestionBody = z.infer<typeof updateQuizQuestionSchema>;

// ---------------------------------------------------------------------------
// Content tags (polymorphic) & progress -- contentType/contentId come from
// route params on every one of these endpoints, validated the same way as
// any other param via validateBody() below (Fastify hands params through as
// plain strings/objects same as a JSON body).
// ---------------------------------------------------------------------------

export const attachTagSchema = z.object({
  tagId: uuidField('tagId'),
});
export type AttachTagBody = z.infer<typeof attachTagSchema>;

export const contentTypeParamSchema = z.object({
  contentType,
  contentId: uuidField('contentId'),
});
export type ContentTypeParam = z.infer<typeof contentTypeParamSchema>;

// DELETE /content/:contentType/:contentId/tags/:tagId's params -- extends
// contentTypeParamSchema rather than redeclaring contentType/contentId, so
// the two schemas can never drift apart.
export const detachTagParamSchema = contentTypeParamSchema.extend({
  tagId: uuidField('tagId'),
});
export type DetachTagParam = z.infer<typeof detachTagParamSchema>;

// Shared :id param schema for routes addressed by raw UUID rather than slug
// (currently just quiz questions, which -- unlike the five content types --
// have no slug of their own; education-schema.ts gives them no such column).
// zod's default "strip unknown keys" parse mode means this also works
// unmodified against a params object that has extra sibling keys (e.g.
// PATCH /quizzes/:slug/questions/:id's params also carry `slug`).
export const idParamSchema = z.object({ id: uuidField('id') });
export type IdParam = z.infer<typeof idParamSchema>;

export const upsertProgressSchema = z.object({
  status: progressStatus,
  progressPct: progressPct.optional(),
});
export type UpsertProgressBody = z.infer<typeof upsertProgressSchema>;

// ---------------------------------------------------------------------------
// Quiz attempts
// ---------------------------------------------------------------------------

export const submitQuizAttemptSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: uuidField('questionId'),
        selectedOptionIndex: z.number().int().min(0),
      }),
    )
    .min(1, 'at least one answer is required'),
});
export type SubmitQuizAttemptBody = z.infer<typeof submitQuizAttemptSchema>;

// ---------------------------------------------------------------------------
// Tutor (Task 7.3) & annotation (Task 7.4) -- both take an ExpertOpinion[]
// produced upstream (a future orchestration layer per D12, or a manual
// caller today). This intentionally duplicates ExpertOpinion/TradeIdea's
// shape from packages/shared-types as a zod schema rather than relying on
// services/ai's assertValidOpinion: that function validates an agent's
// *output* opinion (called from runAgent() after EducationAgent.analyze()
// already ran), not the *input* opinions array this endpoint receives over
// HTTP -- a malformed input here would otherwise reach
// EducationAgent.analyze()'s confidence-weighted average and throw an
// unhandled TypeError instead of a clean 400. Expert/verdict literals below
// are hand-mirrored from packages/shared-types' ExpertName/Verdict for the
// same reason contentStatus/etc. above mirror education-schema.ts: zod
// cannot import a literal union type as a runtime enum.
const expertName = z.enum(['technical', 'options', 'sector', 'quant', 'strategy', 'risk', 'fundamental', 'indices', 'education']);
const verdict = z.enum(['bullish', 'moderately_bullish', 'neutral', 'moderately_bearish', 'bearish']);

const expertOpinionSchema = z.object({
  expert: expertName,
  verdict,
  confidence: z.number().min(0).max(100),
  reasoning: z.array(z.string().min(1)).min(1, 'reasoning must be a non-empty array'),
  generatedAtIso: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'generatedAtIso must be a parseable ISO timestamp'),
});

export const tutorExplainSchema = z.object({
  opinions: z.array(expertOpinionSchema),
});
export type TutorExplainBody = z.infer<typeof tutorExplainSchema>;

const tradeIdeaSchema = z.object({
  symbol: shortText('symbol', 20),
  direction: z.enum(['long', 'short']),
  entry: z.number(),
  stopLoss: z.number(),
  target: z.number(),
  riskRewardRatio: z.number(),
  educationNote: z.string().optional(),
});

export const annotateTradeIdeaSchema = z.object({
  tradeIdea: tradeIdeaSchema,
  opinions: z.array(expertOpinionSchema),
});
export type AnnotateTradeIdeaBody = z.infer<typeof annotateTradeIdeaSchema>;

// ---------------------------------------------------------------------------
// Validation runner -- identical contract to services/auth/src/validation.ts's
// validateBody/ValidationResult/ValidationFailure, reused verbatim so every
// route across both services returns the same `{ error, details }` shape on
// a 400.
// ---------------------------------------------------------------------------

export interface ValidationFailure {
  error: string;
  details: Array<{ path: string; message: string }>;
}

export type ValidationResult<T> = { success: true; data: T } | { success: false; failure: ValidationFailure };

export function validateBody<T>(schema: z.ZodType<T>, body: unknown): ValidationResult<T> {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    failure: {
      error: 'Validation failed',
      details: result.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join('.') : '(body)',
        message: issue.message,
      })),
    },
  };
}
