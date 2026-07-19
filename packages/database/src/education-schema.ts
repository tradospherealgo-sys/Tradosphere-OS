import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  jsonb,
  customType,
} from 'drizzle-orm/pg-core';
import { users } from './schema';

// Schema for Sprint 7 -- Education. Kept in its own file per the convention
// set in schema.ts ("everything else gets its own schema file in its own
// sprint"). Backs `services/education` (Decision D11, EXECUTION_BOOK.md: a
// real CRUD-capable, database-backed content service, not static files
// under `knowledge/*`, which is where SPRINT_BOOK.md's task 7.1/7.2 wording
// would otherwise have pointed -- see D11 for why that precedent doesn't
// apply here).
//
// Design responds directly to Anshh's Sprint 7 kickoff answer (D11):
// categories, tags, versioning, full-text search, an AI-generated-content
// flag, and per-user progress tracking, built generically enough that a
// future web or mobile client needs nothing beyond the same CRUD/search
// HTTP surface `services/education` exposes over this schema.
//
// Three mechanisms are deliberately generic -- one `content_type` enum plus
// a plain `content_id` uuid, not five near-identical tables per content
// type: tagging (`educationContentTags`), version history
// (`educationContentRevisions`), and per-user progress
// (`educationUserProgress`). `content_id` is intentionally not a foreign
// key: it can point into any one of five different tables depending on
// `content_type`, which Postgres has no single-column FK syntax for. Every
// write to these three polymorphic tables happens through
// `services/education`'s repository layer, never hand-written SQL, so the
// pointer is valid by construction from the writing side.

export const educationContentStatusEnum = pgEnum('education_content_status', [
  'draft',
  'published',
  'archived',
]);

// The AI-generated-content flag D11 asks for: every top-level content row
// records whether a human or an AI (e.g. a future authoring tool built on
// services/ai) produced it, surfaced back through the CRUD API rather than
// silently blended with human-authored content.
export const educationContentSourceEnum = pgEnum('education_content_source', ['human', 'ai_generated']);

export const educationDifficultyEnum = pgEnum('education_difficulty', [
  'beginner',
  'intermediate',
  'advanced',
]);

// Discriminator for the three polymorphic tables below (tags, revisions,
// progress) -- one enum, reused three times, instead of three separate
// near-identical enums.
export const educationContentTypeEnum = pgEnum('education_content_type', [
  'glossary_term',
  'course',
  'lesson',
  'strategy',
  'quiz',
]);

export const educationProgressStatusEnum = pgEnum('education_progress_status', [
  'not_started',
  'in_progress',
  'completed',
]);

// Postgres' native full-text search type. Not a generated/computed column --
// `services/education`'s repository layer populates it explicitly on every
// insert/update via `to_tsvector('english', ...)`, which keeps population
// logic visible and testable in application code rather than depending on
// drizzle-kit's generated-column support. Confirmed via a throwaway
// drizzle-kit `generate` probe (installed drizzle-orm/drizzle-kit in a
// scratch dir, ran `generate` against a minimal table using this exact
// customType) that this produces a plain `tsvector` column plus a working
// `CREATE INDEX ... USING gin (...)`, before committing to the approach
// here -- not assumed from documentation alone.
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const educationCategories = pgTable(
  'education_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex('education_categories_slug_unique').on(table.slug),
  }),
);

export const educationTags = pgTable(
  'education_tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex('education_tags_slug_unique').on(table.slug),
  }),
);

export const glossaryTerms = pgTable(
  'glossary_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    term: text('term').notNull(),
    definition: text('definition').notNull(),
    categoryId: uuid('category_id').references(() => educationCategories.id, { onDelete: 'set null' }),
    status: educationContentStatusEnum('status').notNull().default('draft'),
    sourceType: educationContentSourceEnum('source_type').notNull().default('human'),
    version: integer('version').notNull().default(1),
    searchVector: tsvector('search_vector'),
    // Nullable + `set null` (unlike `sessions.user_id`'s `cascade`):
    // deleting the authoring user's account must not delete the content
    // they wrote for the platform's learners.
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex('glossary_terms_slug_unique').on(table.slug),
    searchIdx: index('glossary_terms_search_idx').using('gin', table.searchVector),
  }),
);

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    categoryId: uuid('category_id').references(() => educationCategories.id, { onDelete: 'set null' }),
    difficulty: educationDifficultyEnum('difficulty').notNull().default('beginner'),
    status: educationContentStatusEnum('status').notNull().default('draft'),
    sourceType: educationContentSourceEnum('source_type').notNull().default('human'),
    version: integer('version').notNull().default(1),
    searchVector: tsvector('search_vector'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex('courses_slug_unique').on(table.slug),
    searchIdx: index('courses_search_idx').using('gin', table.searchVector),
  }),
);

export const lessons = pgTable(
  'lessons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    status: educationContentStatusEnum('status').notNull().default('draft'),
    sourceType: educationContentSourceEnum('source_type').notNull().default('human'),
    version: integer('version').notNull().default(1),
    searchVector: tsvector('search_vector'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Lesson slugs are scoped to their course, not global -- two different
    // courses may each have their own "introduction" lesson.
    courseSlugUnique: uniqueIndex('lessons_course_slug_unique').on(table.courseId, table.slug),
    searchIdx: index('lessons_search_idx').using('gin', table.searchVector),
  }),
);

export const strategies = pgTable(
  'strategies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    categoryId: uuid('category_id').references(() => educationCategories.id, { onDelete: 'set null' }),
    difficulty: educationDifficultyEnum('difficulty').notNull().default('beginner'),
    status: educationContentStatusEnum('status').notNull().default('draft'),
    sourceType: educationContentSourceEnum('source_type').notNull().default('human'),
    version: integer('version').notNull().default(1),
    searchVector: tsvector('search_vector'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex('strategies_slug_unique').on(table.slug),
    searchIdx: index('strategies_search_idx').using('gin', table.searchVector),
  }),
);

export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    // Both nullable: a quiz may close out a course (courseId set, lessonId
    // null), close out a single lesson (lessonId set), or stand alone (both
    // null -- e.g. a general knowledge check). Not enforced as mutually
    // exclusive at the schema level -- services/education's validation
    // layer is the right place for that business rule, not a CHECK
    // constraint every future migration would need to know about.
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }),
    status: educationContentStatusEnum('status').notNull().default('draft'),
    sourceType: educationContentSourceEnum('source_type').notNull().default('human'),
    version: integer('version').notNull().default(1),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex('quizzes_slug_unique').on(table.slug),
  }),
);

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    // Plain jsonb array of option strings rather than a separate
    // quiz_options table -- options have no independent identity or
    // lifecycle outside their question, so a child table would only add
    // join overhead with no behavioral benefit.
    options: jsonb('options').notNull().$type<string[]>(),
    correctOptionIndex: integer('correct_option_index').notNull(),
    explanation: text('explanation'),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    quizOrderUnique: uniqueIndex('quiz_questions_quiz_order_unique').on(table.quizId, table.orderIndex),
  }),
);

// Generic many-to-many tag join, one table for all five content types
// instead of five near-identical join tables (see file header). Uniqueness
// is on the full (content_type, content_id, tag_id) triple so the same tag
// can never be attached twice to the same piece of content.
export const educationContentTags = pgTable(
  'education_content_tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentType: educationContentTypeEnum('content_type').notNull(),
    contentId: uuid('content_id').notNull(),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => educationTags.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    contentTagUnique: uniqueIndex('education_content_tags_unique').on(
      table.contentType,
      table.contentId,
      table.tagId,
    ),
  }),
);

// Generic version history, one table for all five content types (see file
// header) instead of five parallel `*_revisions` tables. `services/education`
// writes one row here immediately before applying any update to a content
// row, capturing the full pre-update state as `snapshot` -- so version N's
// content is always reconstructable even after the live row has moved on to
// version N+1. The (content_type, content_id, version) unique index makes
// each revision write idempotent and makes "get me version 3 of this
// lesson" a direct lookup, not a scan.
export const educationContentRevisions = pgTable(
  'education_content_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentType: educationContentTypeEnum('content_type').notNull(),
    contentId: uuid('content_id').notNull(),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').notNull().$type<Record<string, unknown>>(),
    editedBy: uuid('edited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    contentVersionUnique: uniqueIndex('education_content_revisions_unique').on(
      table.contentType,
      table.contentId,
      table.version,
    ),
  }),
);

// Per-user, per-content-item progress. Same polymorphic (content_type,
// content_id) pointer as tags/revisions above, reused for the same reason:
// one table instead of five, and a learner's progress list ("everything
// I've started or finished") is one query instead of a five-table union.
// The unique index on (user_id, content_type, content_id) is what makes
// "mark this lesson complete" an idempotent upsert (`ON CONFLICT ... DO
// UPDATE`), matching the ingestion-idempotency pattern already established
// for `market_ticks`/`company_fundamentals`.
export const educationUserProgress = pgTable(
  'education_user_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    contentType: educationContentTypeEnum('content_type').notNull(),
    contentId: uuid('content_id').notNull(),
    status: educationProgressStatusEnum('status').notNull().default('not_started'),
    progressPct: integer('progress_pct').notNull().default(0),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userContentUnique: uniqueIndex('education_user_progress_unique').on(
      table.userId,
      table.contentType,
      table.contentId,
    ),
  }),
);

// Quiz-specific scoring history -- distinct from the generic progress table
// above because a quiz can be attempted more than once and each attempt's
// score/answers are worth keeping (a learner retrying a quiz shouldn't
// overwrite their first attempt), unlike lesson/course progress, which is a
// single running state per user.
export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    totalQuestions: integer('total_questions').notNull(),
    answers: jsonb('answers')
      .notNull()
      .$type<{ questionId: string; selectedOptionIndex: number; correct: boolean }[]>(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Not unique -- retries are allowed and each attempt is its own row.
    // Indexed (not just left as a bare FK) because "get this user's attempt
    // history for this quiz" is the expected read pattern.
    userQuizIdx: index('quiz_attempts_user_quiz_idx').on(table.userId, table.quizId),
  }),
);

export type EducationCategory = typeof educationCategories.$inferSelect;
export type NewEducationCategory = typeof educationCategories.$inferInsert;
export type EducationTag = typeof educationTags.$inferSelect;
export type NewEducationTag = typeof educationTags.$inferInsert;
export type GlossaryTerm = typeof glossaryTerms.$inferSelect;
export type NewGlossaryTerm = typeof glossaryTerms.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;
export type Strategy = typeof strategies.$inferSelect;
export type NewStrategy = typeof strategies.$inferInsert;
export type Quiz = typeof quizzes.$inferSelect;
export type NewQuiz = typeof quizzes.$inferInsert;
export type QuizQuestion = typeof quizQuestions.$inferSelect;
export type NewQuizQuestion = typeof quizQuestions.$inferInsert;
export type EducationContentTag = typeof educationContentTags.$inferSelect;
export type NewEducationContentTag = typeof educationContentTags.$inferInsert;
export type EducationContentRevision = typeof educationContentRevisions.$inferSelect;
export type NewEducationContentRevision = typeof educationContentRevisions.$inferInsert;
export type EducationUserProgress = typeof educationUserProgress.$inferSelect;
export type NewEducationUserProgress = typeof educationUserProgress.$inferInsert;
export type QuizAttempt = typeof quizAttempts.$inferSelect;
export type NewQuizAttempt = typeof quizAttempts.$inferInsert;
