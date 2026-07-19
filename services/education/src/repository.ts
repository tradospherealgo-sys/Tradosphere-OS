import { eq, and, sql } from 'drizzle-orm';
import {
  educationCategories,
  educationTags,
  glossaryTerms,
  courses,
  lessons,
  strategies,
  quizzes,
  quizQuestions,
  educationContentTags,
  educationContentRevisions,
  educationUserProgress,
  quizAttempts,
  type Database,
  type EducationCategory,
  type EducationTag,
  type GlossaryTerm,
  type Course,
  type Lesson,
  type Strategy,
  type Quiz,
  type QuizQuestion,
  type EducationContentTag,
  type EducationContentRevision,
  type EducationUserProgress,
  type QuizAttempt,
} from '@tradosphere/database';
import { NotFoundError, SlugInUseError, DuplicateError } from './errors';

// Ports (interfaces) + Drizzle adapters, mirroring services/auth/src/repository.ts's
// split: business logic and app.ts depend on the interfaces below, never on
// Drizzle directly, so tests can substitute in-memory fakes (test/fakes.ts)
// instead of routing through pg-mem -- same reason auth's repository.ts gives
// (pg-mem's Pool shim doesn't implement drizzle's `.returning()`). Unlike
// auth's hand-narrowed Record types, the Record types here are direct aliases
// of packages/database's own `$inferSelect` types: content CRUD callers need
// the full row (title, description, status, version, timestamps, ...), so
// there is no meaningful narrower "port vocabulary" to carve out the way
// UserRecord deliberately drops internal fields auth's business logic never
// reads.

// Discriminator shared by the three polymorphic tables (education-schema.ts's
// file header) -- derived from one of them rather than re-declared, so it can
// never drift from the actual column type.
export type ContentType = EducationContentTag['contentType'];

// Postgres error code 23505 = unique_violation. Same narrow, constraint-scoped
// duck-typed check as services/auth/src/repository.ts's isUniqueViolation --
// see that file's comment for why this isn't a blanket `code === '23505'` check.
function isUniqueViolation(err: unknown, constraint: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505' &&
    'constraint' in err &&
    (err as { constraint?: unknown }).constraint === constraint
  );
}

// ---------------------------------------------------------------------------
// Categories & Tags -- simple, unversioned reference data shared across all
// five content types.
// ---------------------------------------------------------------------------

export interface CreateCategoryInput {
  slug: string;
  name: string;
  description?: string;
}

export interface CategoryRepository {
  list(): Promise<EducationCategory[]>;
  create(input: CreateCategoryInput): Promise<EducationCategory>;
}

export class DrizzleCategoryRepository implements CategoryRepository {
  constructor(private readonly db: Database) {}

  async list(): Promise<EducationCategory[]> {
    return this.db.select().from(educationCategories).orderBy(educationCategories.name);
  }

  async create(input: CreateCategoryInput): Promise<EducationCategory> {
    try {
      const [row] = await this.db.insert(educationCategories).values(input).returning();
      return row;
    } catch (err) {
      if (isUniqueViolation(err, 'education_categories_slug_unique')) {
        throw new SlugInUseError('category', input.slug);
      }
      throw err;
    }
  }
}

export interface CreateTagInput {
  slug: string;
  name: string;
}

export interface TagRepository {
  list(): Promise<EducationTag[]>;
  create(input: CreateTagInput): Promise<EducationTag>;
}

export class DrizzleTagRepository implements TagRepository {
  constructor(private readonly db: Database) {}

  async list(): Promise<EducationTag[]> {
    return this.db.select().from(educationTags).orderBy(educationTags.name);
  }

  async create(input: CreateTagInput): Promise<EducationTag> {
    try {
      const [row] = await this.db.insert(educationTags).values(input).returning();
      return row;
    } catch (err) {
      if (isUniqueViolation(err, 'education_tags_slug_unique')) {
        throw new SlugInUseError('tag', input.slug);
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Glossary terms
// ---------------------------------------------------------------------------

export interface CreateGlossaryTermInput {
  slug: string;
  term: string;
  definition: string;
  categoryId?: string;
  status?: GlossaryTerm['status'];
  sourceType?: GlossaryTerm['sourceType'];
  createdBy?: string;
}
export type UpdateGlossaryTermInput = Partial<Omit<CreateGlossaryTermInput, 'slug'>>;

export interface GlossaryFilter {
  categoryId?: string;
  status?: GlossaryTerm['status'];
  search?: string;
}

export interface GlossaryRepository {
  list(filter?: GlossaryFilter): Promise<GlossaryTerm[]>;
  getBySlug(slug: string): Promise<GlossaryTerm | undefined>;
  create(input: CreateGlossaryTermInput): Promise<GlossaryTerm>;
  update(slug: string, patch: UpdateGlossaryTermInput, editedBy?: string): Promise<GlossaryTerm>;
  remove(slug: string): Promise<void>;
}

export class DrizzleGlossaryRepository implements GlossaryRepository {
  constructor(private readonly db: Database) {}

  async list(filter: GlossaryFilter = {}): Promise<GlossaryTerm[]> {
    const conditions = [];
    if (filter.categoryId) conditions.push(eq(glossaryTerms.categoryId, filter.categoryId));
    if (filter.status) conditions.push(eq(glossaryTerms.status, filter.status));
    // Task 7.1 (search): plainto_tsquery turns free-text user input into a
    // tsquery for us (handles stemming/stopwords) -- no separate query
    // parser needed on our side. Matched against the search_vector column
    // repository writes maintain on every create/update below.
    if (filter.search) {
      conditions.push(sql`${glossaryTerms.searchVector} @@ plainto_tsquery('english', ${filter.search})`);
    }
    const query = this.db.select().from(glossaryTerms);
    return conditions.length > 0 ? query.where(and(...conditions)) : query;
  }

  async getBySlug(slug: string): Promise<GlossaryTerm | undefined> {
    const [row] = await this.db.select().from(glossaryTerms).where(eq(glossaryTerms.slug, slug)).limit(1);
    return row;
  }

  async create(input: CreateGlossaryTermInput): Promise<GlossaryTerm> {
    try {
      const [row] = await this.db
        .insert(glossaryTerms)
        .values({
          slug: input.slug,
          term: input.term,
          definition: input.definition,
          categoryId: input.categoryId,
          status: input.status,
          sourceType: input.sourceType,
          createdBy: input.createdBy,
          searchVector: sql`to_tsvector('english', ${input.term + ' ' + input.definition})`,
        })
        .returning();
      return row;
    } catch (err) {
      if (isUniqueViolation(err, 'glossary_terms_slug_unique')) {
        throw new SlugInUseError('glossary term', input.slug);
      }
      throw err;
    }
  }

  async update(slug: string, patch: UpdateGlossaryTermInput, editedBy?: string): Promise<GlossaryTerm> {
    const current = await this.getBySlug(slug);
    if (!current) throw new NotFoundError('glossary term', slug);
    const merged = {
      term: patch.term ?? current.term,
      definition: patch.definition ?? current.definition,
      categoryId: patch.categoryId ?? current.categoryId,
      status: patch.status ?? current.status,
      sourceType: patch.sourceType ?? current.sourceType,
    };
    // Snapshot-then-update inside one transaction: education_content_revisions
    // must never end up missing the row a version bump implies, or (worse)
    // contain one the content table's own version counter doesn't agree with.
    return this.db.transaction(async (tx) => {
      await tx.insert(educationContentRevisions).values({
        contentType: 'glossary_term',
        contentId: current.id,
        version: current.version,
        snapshot: current as unknown as Record<string, unknown>,
        editedBy,
      });
      const [row] = await tx
        .update(glossaryTerms)
        .set({
          ...merged,
          version: current.version + 1,
          searchVector: sql`to_tsvector('english', ${merged.term + ' ' + merged.definition})`,
          updatedAt: new Date(),
        })
        .where(eq(glossaryTerms.id, current.id))
        .returning();
      return row;
    });
  }

  async remove(slug: string): Promise<void> {
    await this.db.delete(glossaryTerms).where(eq(glossaryTerms.slug, slug));
  }
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export interface CreateCourseInput {
  slug: string;
  title: string;
  description: string;
  categoryId?: string;
  difficulty?: Course['difficulty'];
  status?: Course['status'];
  sourceType?: Course['sourceType'];
  createdBy?: string;
}
export type UpdateCourseInput = Partial<Omit<CreateCourseInput, 'slug'>>;

export interface CourseFilter {
  categoryId?: string;
  status?: Course['status'];
  difficulty?: Course['difficulty'];
  search?: string;
}

export interface CourseRepository {
  list(filter?: CourseFilter): Promise<Course[]>;
  getBySlug(slug: string): Promise<Course | undefined>;
  create(input: CreateCourseInput): Promise<Course>;
  update(slug: string, patch: UpdateCourseInput, editedBy?: string): Promise<Course>;
  remove(slug: string): Promise<void>;
}

export class DrizzleCourseRepository implements CourseRepository {
  constructor(private readonly db: Database) {}

  async list(filter: CourseFilter = {}): Promise<Course[]> {
    const conditions = [];
    if (filter.categoryId) conditions.push(eq(courses.categoryId, filter.categoryId));
    if (filter.status) conditions.push(eq(courses.status, filter.status));
    if (filter.difficulty) conditions.push(eq(courses.difficulty, filter.difficulty));
    if (filter.search) conditions.push(sql`${courses.searchVector} @@ plainto_tsquery('english', ${filter.search})`);
    const query = this.db.select().from(courses);
    return conditions.length > 0 ? query.where(and(...conditions)) : query;
  }

  async getBySlug(slug: string): Promise<Course | undefined> {
    const [row] = await this.db.select().from(courses).where(eq(courses.slug, slug)).limit(1);
    return row;
  }

  async create(input: CreateCourseInput): Promise<Course> {
    try {
      const [row] = await this.db
        .insert(courses)
        .values({
          slug: input.slug,
          title: input.title,
          description: input.description,
          categoryId: input.categoryId,
          difficulty: input.difficulty,
          status: input.status,
          sourceType: input.sourceType,
          createdBy: input.createdBy,
          searchVector: sql`to_tsvector('english', ${input.title + ' ' + input.description})`,
        })
        .returning();
      return row;
    } catch (err) {
      if (isUniqueViolation(err, 'courses_slug_unique')) {
        throw new SlugInUseError('course', input.slug);
      }
      throw err;
    }
  }

  async update(slug: string, patch: UpdateCourseInput, editedBy?: string): Promise<Course> {
    const current = await this.getBySlug(slug);
    if (!current) throw new NotFoundError('course', slug);
    const merged = {
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      categoryId: patch.categoryId ?? current.categoryId,
      difficulty: patch.difficulty ?? current.difficulty,
      status: patch.status ?? current.status,
      sourceType: patch.sourceType ?? current.sourceType,
    };
    return this.db.transaction(async (tx) => {
      await tx.insert(educationContentRevisions).values({
        contentType: 'course',
        contentId: current.id,
        version: current.version,
        snapshot: current as unknown as Record<string, unknown>,
        editedBy,
      });
      const [row] = await tx
        .update(courses)
        .set({
          ...merged,
          version: current.version + 1,
          searchVector: sql`to_tsvector('english', ${merged.title + ' ' + merged.description})`,
          updatedAt: new Date(),
        })
        .where(eq(courses.id, current.id))
        .returning();
      return row;
    });
  }

  async remove(slug: string): Promise<void> {
    // lessons.course_id and quizzes.course_id are both `onDelete: 'cascade'`
    // (education-schema.ts) -- removing a course removes its lessons and
    // course-level quizzes with it, enforced by the FK, not re-implemented
    // here.
    await this.db.delete(courses).where(eq(courses.slug, slug));
  }
}

// ---------------------------------------------------------------------------
// Lessons -- scoped to a parent course; slugs are unique per-course, not
// globally (education-schema.ts's lessons_course_slug_unique).
// ---------------------------------------------------------------------------

export interface CreateLessonInput {
  courseId: string;
  slug: string;
  title: string;
  content: string;
  orderIndex?: number;
  status?: Lesson['status'];
  sourceType?: Lesson['sourceType'];
  createdBy?: string;
}
export type UpdateLessonInput = Partial<Omit<CreateLessonInput, 'courseId' | 'slug'>>;

// Unlike Glossary/Course/Strategy's CourseFilter-style filters, there is no
// categoryId/difficulty here -- a lesson inherits both from its parent
// course, so re-filtering by them at the lesson level would just duplicate
// what listByCourse(courseId) already scopes to. status/search are kept for
// parity with the other four content types, since lessons do carry both
// (status, search_vector) per education-schema.ts and a course with dozens
// of lessons still needs to search/filter within it.
export interface LessonFilter {
  status?: Lesson['status'];
  search?: string;
}

export interface LessonRepository {
  listByCourse(courseId: string, filter?: LessonFilter): Promise<Lesson[]>;
  getBySlug(courseId: string, slug: string): Promise<Lesson | undefined>;
  create(input: CreateLessonInput): Promise<Lesson>;
  update(courseId: string, slug: string, patch: UpdateLessonInput, editedBy?: string): Promise<Lesson>;
  remove(courseId: string, slug: string): Promise<void>;
}

export class DrizzleLessonRepository implements LessonRepository {
  constructor(private readonly db: Database) {}

  async listByCourse(courseId: string, filter: LessonFilter = {}): Promise<Lesson[]> {
    const conditions = [eq(lessons.courseId, courseId)];
    if (filter.status) conditions.push(eq(lessons.status, filter.status));
    if (filter.search) {
      conditions.push(sql`${lessons.searchVector} @@ plainto_tsquery('english', ${filter.search})`);
    }
    return this.db
      .select()
      .from(lessons)
      .where(and(...conditions))
      .orderBy(lessons.orderIndex);
  }

  async getBySlug(courseId: string, slug: string): Promise<Lesson | undefined> {
    const [row] = await this.db
      .select()
      .from(lessons)
      .where(and(eq(lessons.courseId, courseId), eq(lessons.slug, slug)))
      .limit(1);
    return row;
  }

  async create(input: CreateLessonInput): Promise<Lesson> {
    try {
      const [row] = await this.db
        .insert(lessons)
        .values({
          courseId: input.courseId,
          slug: input.slug,
          title: input.title,
          content: input.content,
          orderIndex: input.orderIndex,
          status: input.status,
          sourceType: input.sourceType,
          createdBy: input.createdBy,
          searchVector: sql`to_tsvector('english', ${input.title + ' ' + input.content})`,
        })
        .returning();
      return row;
    } catch (err) {
      if (isUniqueViolation(err, 'lessons_course_slug_unique')) {
        throw new SlugInUseError('lesson', input.slug);
      }
      throw err;
    }
  }

  async update(courseId: string, slug: string, patch: UpdateLessonInput, editedBy?: string): Promise<Lesson> {
    const current = await this.getBySlug(courseId, slug);
    if (!current) throw new NotFoundError('lesson', slug);
    const merged = {
      title: patch.title ?? current.title,
      content: patch.content ?? current.content,
      orderIndex: patch.orderIndex ?? current.orderIndex,
      status: patch.status ?? current.status,
      sourceType: patch.sourceType ?? current.sourceType,
    };
    return this.db.transaction(async (tx) => {
      await tx.insert(educationContentRevisions).values({
        contentType: 'lesson',
        contentId: current.id,
        version: current.version,
        snapshot: current as unknown as Record<string, unknown>,
        editedBy,
      });
      const [row] = await tx
        .update(lessons)
        .set({
          ...merged,
          version: current.version + 1,
          searchVector: sql`to_tsvector('english', ${merged.title + ' ' + merged.content})`,
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, current.id))
        .returning();
      return row;
    });
  }

  async remove(courseId: string, slug: string): Promise<void> {
    await this.db.delete(lessons).where(and(eq(lessons.courseId, courseId), eq(lessons.slug, slug)));
  }
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export interface CreateStrategyInput {
  slug: string;
  name: string;
  description: string;
  categoryId?: string;
  difficulty?: Strategy['difficulty'];
  status?: Strategy['status'];
  sourceType?: Strategy['sourceType'];
  createdBy?: string;
}
export type UpdateStrategyInput = Partial<Omit<CreateStrategyInput, 'slug'>>;

export interface StrategyFilter {
  categoryId?: string;
  status?: Strategy['status'];
  difficulty?: Strategy['difficulty'];
  search?: string;
}

export interface StrategyRepository {
  list(filter?: StrategyFilter): Promise<Strategy[]>;
  getBySlug(slug: string): Promise<Strategy | undefined>;
  create(input: CreateStrategyInput): Promise<Strategy>;
  update(slug: string, patch: UpdateStrategyInput, editedBy?: string): Promise<Strategy>;
  remove(slug: string): Promise<void>;
}

export class DrizzleStrategyRepository implements StrategyRepository {
  constructor(private readonly db: Database) {}

  async list(filter: StrategyFilter = {}): Promise<Strategy[]> {
    const conditions = [];
    if (filter.categoryId) conditions.push(eq(strategies.categoryId, filter.categoryId));
    if (filter.status) conditions.push(eq(strategies.status, filter.status));
    if (filter.difficulty) conditions.push(eq(strategies.difficulty, filter.difficulty));
    if (filter.search) {
      conditions.push(sql`${strategies.searchVector} @@ plainto_tsquery('english', ${filter.search})`);
    }
    const query = this.db.select().from(strategies);
    return conditions.length > 0 ? query.where(and(...conditions)) : query;
  }

  async getBySlug(slug: string): Promise<Strategy | undefined> {
    const [row] = await this.db.select().from(strategies).where(eq(strategies.slug, slug)).limit(1);
    return row;
  }

  async create(input: CreateStrategyInput): Promise<Strategy> {
    try {
      const [row] = await this.db
        .insert(strategies)
        .values({
          slug: input.slug,
          name: input.name,
          description: input.description,
          categoryId: input.categoryId,
          difficulty: input.difficulty,
          status: input.status,
          sourceType: input.sourceType,
          createdBy: input.createdBy,
          searchVector: sql`to_tsvector('english', ${input.name + ' ' + input.description})`,
        })
        .returning();
      return row;
    } catch (err) {
      if (isUniqueViolation(err, 'strategies_slug_unique')) {
        throw new SlugInUseError('strategy', input.slug);
      }
      throw err;
    }
  }

  async update(slug: string, patch: UpdateStrategyInput, editedBy?: string): Promise<Strategy> {
    const current = await this.getBySlug(slug);
    if (!current) throw new NotFoundError('strategy', slug);
    const merged = {
      name: patch.name ?? current.name,
      description: patch.description ?? current.description,
      categoryId: patch.categoryId ?? current.categoryId,
      difficulty: patch.difficulty ?? current.difficulty,
      status: patch.status ?? current.status,
      sourceType: patch.sourceType ?? current.sourceType,
    };
    return this.db.transaction(async (tx) => {
      await tx.insert(educationContentRevisions).values({
        contentType: 'strategy',
        contentId: current.id,
        version: current.version,
        snapshot: current as unknown as Record<string, unknown>,
        editedBy,
      });
      const [row] = await tx
        .update(strategies)
        .set({
          ...merged,
          version: current.version + 1,
          searchVector: sql`to_tsvector('english', ${merged.name + ' ' + merged.description})`,
          updatedAt: new Date(),
        })
        .where(eq(strategies.id, current.id))
        .returning();
      return row;
    });
  }

  async remove(slug: string): Promise<void> {
    await this.db.delete(strategies).where(eq(strategies.slug, slug));
  }
}

// ---------------------------------------------------------------------------
// Quizzes & quiz questions -- no search_vector (quizzes aren't prose content
// to full-text-search the way glossary/course/lesson/strategy are), and
// questions are children of a quiz, not independently versioned content
// (education-schema.ts gives quiz_questions no `version`/`search_vector`
// columns at all).
// ---------------------------------------------------------------------------

export interface CreateQuizInput {
  slug: string;
  title: string;
  courseId?: string;
  lessonId?: string;
  status?: Quiz['status'];
  sourceType?: Quiz['sourceType'];
  createdBy?: string;
}
export type UpdateQuizInput = Partial<Omit<CreateQuizInput, 'slug'>>;

export interface QuizRepository {
  list(filter?: { status?: Quiz['status']; courseId?: string }): Promise<Quiz[]>;
  getBySlug(slug: string): Promise<Quiz | undefined>;
  create(input: CreateQuizInput): Promise<Quiz>;
  update(slug: string, patch: UpdateQuizInput, editedBy?: string): Promise<Quiz>;
  remove(slug: string): Promise<void>;
}

export class DrizzleQuizRepository implements QuizRepository {
  constructor(private readonly db: Database) {}

  async list(filter: { status?: Quiz['status']; courseId?: string } = {}): Promise<Quiz[]> {
    const conditions = [];
    if (filter.status) conditions.push(eq(quizzes.status, filter.status));
    if (filter.courseId) conditions.push(eq(quizzes.courseId, filter.courseId));
    const query = this.db.select().from(quizzes);
    return conditions.length > 0 ? query.where(and(...conditions)) : query;
  }

  async getBySlug(slug: string): Promise<Quiz | undefined> {
    const [row] = await this.db.select().from(quizzes).where(eq(quizzes.slug, slug)).limit(1);
    return row;
  }

  async create(input: CreateQuizInput): Promise<Quiz> {
    try {
      const [row] = await this.db.insert(quizzes).values(input).returning();
      return row;
    } catch (err) {
      if (isUniqueViolation(err, 'quizzes_slug_unique')) {
        throw new SlugInUseError('quiz', input.slug);
      }
      throw err;
    }
  }

  async update(slug: string, patch: UpdateQuizInput, editedBy?: string): Promise<Quiz> {
    const current = await this.getBySlug(slug);
    if (!current) throw new NotFoundError('quiz', slug);
    const merged = {
      title: patch.title ?? current.title,
      courseId: patch.courseId ?? current.courseId,
      lessonId: patch.lessonId ?? current.lessonId,
      status: patch.status ?? current.status,
      sourceType: patch.sourceType ?? current.sourceType,
    };
    return this.db.transaction(async (tx) => {
      await tx.insert(educationContentRevisions).values({
        contentType: 'quiz',
        contentId: current.id,
        version: current.version,
        snapshot: current as unknown as Record<string, unknown>,
        editedBy,
      });
      const [row] = await tx
        .update(quizzes)
        .set({ ...merged, version: current.version + 1, updatedAt: new Date() })
        .where(eq(quizzes.id, current.id))
        .returning();
      return row;
    });
  }

  async remove(slug: string): Promise<void> {
    await this.db.delete(quizzes).where(eq(quizzes.slug, slug));
  }
}

export interface CreateQuizQuestionInput {
  quizId: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation?: string;
  orderIndex?: number;
}
export type UpdateQuizQuestionInput = Partial<Omit<CreateQuizQuestionInput, 'quizId'>>;

export interface QuizQuestionRepository {
  listByQuiz(quizId: string): Promise<QuizQuestion[]>;
  create(input: CreateQuizQuestionInput): Promise<QuizQuestion>;
  update(id: string, patch: UpdateQuizQuestionInput): Promise<QuizQuestion>;
  remove(id: string): Promise<void>;
}

export class DrizzleQuizQuestionRepository implements QuizQuestionRepository {
  constructor(private readonly db: Database) {}

  async listByQuiz(quizId: string): Promise<QuizQuestion[]> {
    return this.db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quizId)).orderBy(quizQuestions.orderIndex);
  }

  async create(input: CreateQuizQuestionInput): Promise<QuizQuestion> {
    try {
      const [row] = await this.db.insert(quizQuestions).values(input).returning();
      return row;
    } catch (err) {
      if (isUniqueViolation(err, 'quiz_questions_quiz_order_unique')) {
        throw new DuplicateError(`quiz already has a question at order_index ${input.orderIndex ?? 0}`);
      }
      throw err;
    }
  }

  async update(id: string, patch: UpdateQuizQuestionInput): Promise<QuizQuestion> {
    const [row] = await this.db.update(quizQuestions).set(patch).where(eq(quizQuestions.id, id)).returning();
    if (!row) throw new NotFoundError('quiz question', id);
    return row;
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(quizQuestions).where(eq(quizQuestions.id, id));
  }
}

// ---------------------------------------------------------------------------
// Content tags -- generic many-to-many join, one repository for all five
// content types (education-schema.ts's file header rationale).
// ---------------------------------------------------------------------------

export interface ContentTagRepository {
  attach(contentType: ContentType, contentId: string, tagId: string): Promise<void>;
  detach(contentType: ContentType, contentId: string, tagId: string): Promise<void>;
  listForContent(contentType: ContentType, contentId: string): Promise<EducationTag[]>;
}

export class DrizzleContentTagRepository implements ContentTagRepository {
  constructor(private readonly db: Database) {}

  async attach(contentType: ContentType, contentId: string, tagId: string): Promise<void> {
    try {
      await this.db.insert(educationContentTags).values({ contentType, contentId, tagId });
    } catch (err) {
      if (isUniqueViolation(err, 'education_content_tags_unique')) {
        throw new DuplicateError(`tag ${tagId} is already attached to this ${contentType}`);
      }
      throw err;
    }
  }

  async detach(contentType: ContentType, contentId: string, tagId: string): Promise<void> {
    await this.db
      .delete(educationContentTags)
      .where(
        and(
          eq(educationContentTags.contentType, contentType),
          eq(educationContentTags.contentId, contentId),
          eq(educationContentTags.tagId, tagId),
        ),
      );
  }

  async listForContent(contentType: ContentType, contentId: string): Promise<EducationTag[]> {
    const rows = await this.db
      .select({ tag: educationTags })
      .from(educationContentTags)
      .innerJoin(educationTags, eq(educationContentTags.tagId, educationTags.id))
      .where(and(eq(educationContentTags.contentType, contentType), eq(educationContentTags.contentId, contentId)));
    return rows.map((r) => r.tag);
  }
}

// ---------------------------------------------------------------------------
// Revisions -- read-only from this service's own callers; rows are written
// internally by each content repository's update() above, never through this
// interface, so there is no create() method to accidentally call out of band.
// ---------------------------------------------------------------------------

export interface RevisionRepository {
  listForContent(contentType: ContentType, contentId: string): Promise<EducationContentRevision[]>;
}

export class DrizzleRevisionRepository implements RevisionRepository {
  constructor(private readonly db: Database) {}

  async listForContent(contentType: ContentType, contentId: string): Promise<EducationContentRevision[]> {
    return this.db
      .select()
      .from(educationContentRevisions)
      .where(
        and(
          eq(educationContentRevisions.contentType, contentType),
          eq(educationContentRevisions.contentId, contentId),
        ),
      )
      .orderBy(educationContentRevisions.version);
  }
}

// ---------------------------------------------------------------------------
// Per-user progress -- generic across all five content types, upserted via
// the schema's (user_id, content_type, content_id) unique index.
// ---------------------------------------------------------------------------

export interface UpsertProgressInput {
  userId: string;
  contentType: ContentType;
  contentId: string;
  status: EducationUserProgress['status'];
  progressPct?: number;
}

export interface ProgressRepository {
  upsert(input: UpsertProgressInput): Promise<EducationUserProgress>;
  listForUser(userId: string): Promise<EducationUserProgress[]>;
}

export class DrizzleProgressRepository implements ProgressRepository {
  constructor(private readonly db: Database) {}

  async upsert(input: UpsertProgressInput): Promise<EducationUserProgress> {
    // completedAt tracks the most recent transition *into* 'completed' --
    // upserting a non-completed status afterward (e.g. a learner reopens a
    // finished lesson and it's marked 'in_progress' again) clears it, rather
    // than leaving a stale completion timestamp beside a now-incomplete
    // status. Deliberate product behavior, not an oversight.
    const completedAt = input.status === 'completed' ? new Date() : null;
    const [row] = await this.db
      .insert(educationUserProgress)
      .values({
        userId: input.userId,
        contentType: input.contentType,
        contentId: input.contentId,
        status: input.status,
        progressPct: input.progressPct ?? 0,
        lastAccessedAt: new Date(),
        completedAt,
      })
      .onConflictDoUpdate({
        target: [educationUserProgress.userId, educationUserProgress.contentType, educationUserProgress.contentId],
        set: {
          status: input.status,
          progressPct: input.progressPct ?? 0,
          lastAccessedAt: new Date(),
          completedAt,
        },
      })
      .returning();
    return row;
  }

  async listForUser(userId: string): Promise<EducationUserProgress[]> {
    return this.db.select().from(educationUserProgress).where(eq(educationUserProgress.userId, userId));
  }
}

// ---------------------------------------------------------------------------
// Quiz attempts -- pure data access only. Scoring (comparing submitted
// answers against quiz_questions.correct_option_index) is business logic
// that spans two repositories and lives in quiz-scoring.ts instead, matching
// auth-logic.ts's separation from services/auth/src/repository.ts.
// ---------------------------------------------------------------------------

export interface RecordQuizAttemptInput {
  userId: string;
  quizId: string;
  score: number;
  totalQuestions: number;
  answers: { questionId: string; selectedOptionIndex: number; correct: boolean }[];
}

export interface QuizAttemptRepository {
  record(input: RecordQuizAttemptInput): Promise<QuizAttempt>;
  listForUser(userId: string, quizId?: string): Promise<QuizAttempt[]>;
}

export class DrizzleQuizAttemptRepository implements QuizAttemptRepository {
  constructor(private readonly db: Database) {}

  async record(input: RecordQuizAttemptInput): Promise<QuizAttempt> {
    const [row] = await this.db.insert(quizAttempts).values(input).returning();
    return row;
  }

  async listForUser(userId: string, quizId?: string): Promise<QuizAttempt[]> {
    const conditions = [eq(quizAttempts.userId, userId)];
    if (quizId) conditions.push(eq(quizAttempts.quizId, quizId));
    return this.db
      .select()
      .from(quizAttempts)
      .where(and(...conditions));
  }
}
