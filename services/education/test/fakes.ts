import { randomUUID } from 'node:crypto';
import type {
  EducationCategory,
  EducationTag,
  GlossaryTerm,
  Course,
  Lesson,
  Strategy,
  Quiz,
  QuizQuestion,
  EducationContentTag,
  EducationContentRevision,
  EducationUserProgress,
  QuizAttempt,
} from '@tradosphere/database';
import type {
  CategoryRepository,
  CreateCategoryInput,
  TagRepository,
  CreateTagInput,
  GlossaryRepository,
  CreateGlossaryTermInput,
  UpdateGlossaryTermInput,
  GlossaryFilter,
  CourseRepository,
  CreateCourseInput,
  UpdateCourseInput,
  CourseFilter,
  LessonRepository,
  CreateLessonInput,
  UpdateLessonInput,
  LessonFilter,
  StrategyRepository,
  CreateStrategyInput,
  UpdateStrategyInput,
  StrategyFilter,
  QuizRepository,
  CreateQuizInput,
  UpdateQuizInput,
  QuizQuestionRepository,
  CreateQuizQuestionInput,
  UpdateQuizQuestionInput,
  ContentTagRepository,
  ContentType,
  RevisionRepository,
  ProgressRepository,
  UpsertProgressInput,
  QuizAttemptRepository,
  RecordQuizAttemptInput,
} from '../src/repository';
import { NotFoundError, SlugInUseError, DuplicateError } from '../src/errors';

// In-memory test doubles for every repository port in repository.ts. Used
// instead of pg-mem/drizzle for the same reason services/auth/test/fakes.ts
// gives: drizzle's node-postgres driver relies on `.returning()`, which
// pg-mem's Pool shim does not implement (packages/database/test/db.test.ts
// has the full writeup). The Drizzle*Repository adapters are exercised for
// real in repository.integration.test.ts against a real Postgres instead.
//
// Each fake below enforces the same *contract* the real adapter enforces
// (unique slug -> SlugInUseError, missing row on update -> NotFoundError,
// duplicate composite key -> DuplicateError) rather than replicating
// Postgres's wire-level error shape -- same principle auth's
// InMemoryUserRepository states explicitly in its own comment.

// Shared, mutable revision log that every content-repo fake below appends to
// on update() -- mirrors how every DrizzleXRepository in repository.ts reads
// and writes through one shared `db` instance (and therefore one
// education_content_revisions table). Construct one RevisionLog and hand the
// same array to every content repo fake plus InMemoryRevisionRepository in a
// given test; standalone tests that don't care about revisions can omit it
// and each fake will use its own throwaway array.
export type RevisionLog = EducationContentRevision[];

function snapshotRevision(
  log: RevisionLog,
  contentType: ContentType,
  current: { id: string; version: number },
  editedBy?: string,
): void {
  log.push({
    id: randomUUID(),
    contentType,
    contentId: current.id,
    version: current.version,
    snapshot: current as unknown as Record<string, unknown>,
    editedBy: editedBy ?? null,
    createdAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Categories & tags
// ---------------------------------------------------------------------------

export class InMemoryCategoryRepository implements CategoryRepository {
  private bySlug = new Map<string, EducationCategory>();

  async list(): Promise<EducationCategory[]> {
    return [...this.bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(input: CreateCategoryInput): Promise<EducationCategory> {
    if (this.bySlug.has(input.slug)) throw new SlugInUseError('category', input.slug);
    const row: EducationCategory = {
      id: randomUUID(),
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      createdAt: new Date(),
    };
    this.bySlug.set(row.slug, row);
    return row;
  }
}

export class InMemoryTagRepository implements TagRepository {
  private bySlug = new Map<string, EducationTag>();
  private byId = new Map<string, EducationTag>();

  async list(): Promise<EducationTag[]> {
    return [...this.bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(input: CreateTagInput): Promise<EducationTag> {
    if (this.bySlug.has(input.slug)) throw new SlugInUseError('tag', input.slug);
    const row: EducationTag = { id: randomUUID(), slug: input.slug, name: input.name, createdAt: new Date() };
    this.bySlug.set(row.slug, row);
    this.byId.set(row.id, row);
    return row;
  }

  // Test-only convenience, not part of the TagRepository port -- mirrors
  // InMemoryUserRepository.seed() in services/auth/test/fakes.ts. Lets
  // InMemoryContentTagRepository resolve a tagId back to a full EducationTag
  // the same way DrizzleContentTagRepository's innerJoin does.
  getById(id: string): EducationTag | undefined {
    return this.byId.get(id);
  }
}

// ---------------------------------------------------------------------------
// Glossary
// ---------------------------------------------------------------------------

export class InMemoryGlossaryRepository implements GlossaryRepository {
  private bySlug = new Map<string, GlossaryTerm>();

  constructor(private readonly revisions: RevisionLog = []) {}

  async list(filter: GlossaryFilter = {}): Promise<GlossaryTerm[]> {
    let rows = [...this.bySlug.values()];
    if (filter.categoryId) rows = rows.filter((r) => r.categoryId === filter.categoryId);
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
    if (filter.search) {
      const needle = filter.search.toLowerCase();
      rows = rows.filter((r) => `${r.term} ${r.definition}`.toLowerCase().includes(needle));
    }
    return rows;
  }

  async getBySlug(slug: string): Promise<GlossaryTerm | undefined> {
    return this.bySlug.get(slug);
  }

  async create(input: CreateGlossaryTermInput): Promise<GlossaryTerm> {
    if (this.bySlug.has(input.slug)) throw new SlugInUseError('glossary term', input.slug);
    const now = new Date();
    const row: GlossaryTerm = {
      id: randomUUID(),
      slug: input.slug,
      term: input.term,
      definition: input.definition,
      categoryId: input.categoryId ?? null,
      status: input.status ?? 'draft',
      sourceType: input.sourceType ?? 'human',
      version: 1,
      searchVector: null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.bySlug.set(row.slug, row);
    return row;
  }

  async update(slug: string, patch: UpdateGlossaryTermInput, editedBy?: string): Promise<GlossaryTerm> {
    const current = this.bySlug.get(slug);
    if (!current) throw new NotFoundError('glossary term', slug);
    snapshotRevision(this.revisions, 'glossary_term', current, editedBy);
    const updated: GlossaryTerm = {
      ...current,
      term: patch.term ?? current.term,
      definition: patch.definition ?? current.definition,
      categoryId: patch.categoryId ?? current.categoryId,
      status: patch.status ?? current.status,
      sourceType: patch.sourceType ?? current.sourceType,
      version: current.version + 1,
      updatedAt: new Date(),
    };
    this.bySlug.set(slug, updated);
    return updated;
  }

  async remove(slug: string): Promise<void> {
    this.bySlug.delete(slug);
  }
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export class InMemoryCourseRepository implements CourseRepository {
  private bySlug = new Map<string, Course>();

  constructor(private readonly revisions: RevisionLog = []) {}

  async list(filter: CourseFilter = {}): Promise<Course[]> {
    let rows = [...this.bySlug.values()];
    if (filter.categoryId) rows = rows.filter((r) => r.categoryId === filter.categoryId);
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
    if (filter.difficulty) rows = rows.filter((r) => r.difficulty === filter.difficulty);
    if (filter.search) {
      const needle = filter.search.toLowerCase();
      rows = rows.filter((r) => `${r.title} ${r.description}`.toLowerCase().includes(needle));
    }
    return rows;
  }

  async getBySlug(slug: string): Promise<Course | undefined> {
    return this.bySlug.get(slug);
  }

  async create(input: CreateCourseInput): Promise<Course> {
    if (this.bySlug.has(input.slug)) throw new SlugInUseError('course', input.slug);
    const now = new Date();
    const row: Course = {
      id: randomUUID(),
      slug: input.slug,
      title: input.title,
      description: input.description,
      categoryId: input.categoryId ?? null,
      difficulty: input.difficulty ?? 'beginner',
      status: input.status ?? 'draft',
      sourceType: input.sourceType ?? 'human',
      version: 1,
      searchVector: null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.bySlug.set(row.slug, row);
    return row;
  }

  async update(slug: string, patch: UpdateCourseInput, editedBy?: string): Promise<Course> {
    const current = this.bySlug.get(slug);
    if (!current) throw new NotFoundError('course', slug);
    snapshotRevision(this.revisions, 'course', current, editedBy);
    const updated: Course = {
      ...current,
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      categoryId: patch.categoryId ?? current.categoryId,
      difficulty: patch.difficulty ?? current.difficulty,
      status: patch.status ?? current.status,
      sourceType: patch.sourceType ?? current.sourceType,
      version: current.version + 1,
      updatedAt: new Date(),
    };
    this.bySlug.set(slug, updated);
    return updated;
  }

  async remove(slug: string): Promise<void> {
    // Real schema cascades lessons/quizzes scoped to this course via FK
    // (education-schema.ts's onDelete: 'cascade'). Each fake here is an
    // independent Map, so that cascade isn't reproduced in-memory -- tests
    // that need it verified belong in repository.integration.test.ts against
    // a real Postgres.
    this.bySlug.delete(slug);
  }
}

// ---------------------------------------------------------------------------
// Lessons -- scoped to a parent course; keyed on (courseId, slug).
// ---------------------------------------------------------------------------

export class InMemoryLessonRepository implements LessonRepository {
  private rows = new Map<string, Lesson>();

  constructor(private readonly revisions: RevisionLog = []) {}

  private key(courseId: string, slug: string): string {
    return `${courseId}::${slug}`;
  }

  async listByCourse(courseId: string, filter: LessonFilter = {}): Promise<Lesson[]> {
    let rows = [...this.rows.values()].filter((r) => r.courseId === courseId);
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
    if (filter.search) {
      const needle = filter.search.toLowerCase();
      rows = rows.filter((r) => `${r.title} ${r.content}`.toLowerCase().includes(needle));
    }
    return rows.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async getBySlug(courseId: string, slug: string): Promise<Lesson | undefined> {
    return this.rows.get(this.key(courseId, slug));
  }

  async create(input: CreateLessonInput): Promise<Lesson> {
    const key = this.key(input.courseId, input.slug);
    if (this.rows.has(key)) throw new SlugInUseError('lesson', input.slug);
    const now = new Date();
    const row: Lesson = {
      id: randomUUID(),
      courseId: input.courseId,
      slug: input.slug,
      title: input.title,
      content: input.content,
      orderIndex: input.orderIndex ?? 0,
      status: input.status ?? 'draft',
      sourceType: input.sourceType ?? 'human',
      version: 1,
      searchVector: null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(key, row);
    return row;
  }

  async update(courseId: string, slug: string, patch: UpdateLessonInput, editedBy?: string): Promise<Lesson> {
    const key = this.key(courseId, slug);
    const current = this.rows.get(key);
    if (!current) throw new NotFoundError('lesson', slug);
    snapshotRevision(this.revisions, 'lesson', current, editedBy);
    const updated: Lesson = {
      ...current,
      title: patch.title ?? current.title,
      content: patch.content ?? current.content,
      orderIndex: patch.orderIndex ?? current.orderIndex,
      status: patch.status ?? current.status,
      sourceType: patch.sourceType ?? current.sourceType,
      version: current.version + 1,
      updatedAt: new Date(),
    };
    this.rows.set(key, updated);
    return updated;
  }

  async remove(courseId: string, slug: string): Promise<void> {
    this.rows.delete(this.key(courseId, slug));
  }
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export class InMemoryStrategyRepository implements StrategyRepository {
  private bySlug = new Map<string, Strategy>();

  constructor(private readonly revisions: RevisionLog = []) {}

  async list(filter: StrategyFilter = {}): Promise<Strategy[]> {
    let rows = [...this.bySlug.values()];
    if (filter.categoryId) rows = rows.filter((r) => r.categoryId === filter.categoryId);
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
    if (filter.difficulty) rows = rows.filter((r) => r.difficulty === filter.difficulty);
    if (filter.search) {
      const needle = filter.search.toLowerCase();
      rows = rows.filter((r) => `${r.name} ${r.description}`.toLowerCase().includes(needle));
    }
    return rows;
  }

  async getBySlug(slug: string): Promise<Strategy | undefined> {
    return this.bySlug.get(slug);
  }

  async create(input: CreateStrategyInput): Promise<Strategy> {
    if (this.bySlug.has(input.slug)) throw new SlugInUseError('strategy', input.slug);
    const now = new Date();
    const row: Strategy = {
      id: randomUUID(),
      slug: input.slug,
      name: input.name,
      description: input.description,
      categoryId: input.categoryId ?? null,
      difficulty: input.difficulty ?? 'beginner',
      status: input.status ?? 'draft',
      sourceType: input.sourceType ?? 'human',
      version: 1,
      searchVector: null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.bySlug.set(row.slug, row);
    return row;
  }

  async update(slug: string, patch: UpdateStrategyInput, editedBy?: string): Promise<Strategy> {
    const current = this.bySlug.get(slug);
    if (!current) throw new NotFoundError('strategy', slug);
    snapshotRevision(this.revisions, 'strategy', current, editedBy);
    const updated: Strategy = {
      ...current,
      name: patch.name ?? current.name,
      description: patch.description ?? current.description,
      categoryId: patch.categoryId ?? current.categoryId,
      difficulty: patch.difficulty ?? current.difficulty,
      status: patch.status ?? current.status,
      sourceType: patch.sourceType ?? current.sourceType,
      version: current.version + 1,
      updatedAt: new Date(),
    };
    this.bySlug.set(slug, updated);
    return updated;
  }

  async remove(slug: string): Promise<void> {
    this.bySlug.delete(slug);
  }
}

// ---------------------------------------------------------------------------
// Quizzes & quiz questions
// ---------------------------------------------------------------------------

export class InMemoryQuizRepository implements QuizRepository {
  private bySlug = new Map<string, Quiz>();

  constructor(private readonly revisions: RevisionLog = []) {}

  async list(filter: { status?: Quiz['status']; courseId?: string } = {}): Promise<Quiz[]> {
    let rows = [...this.bySlug.values()];
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
    if (filter.courseId) rows = rows.filter((r) => r.courseId === filter.courseId);
    return rows;
  }

  async getBySlug(slug: string): Promise<Quiz | undefined> {
    return this.bySlug.get(slug);
  }

  async create(input: CreateQuizInput): Promise<Quiz> {
    if (this.bySlug.has(input.slug)) throw new SlugInUseError('quiz', input.slug);
    const now = new Date();
    const row: Quiz = {
      id: randomUUID(),
      slug: input.slug,
      title: input.title,
      courseId: input.courseId ?? null,
      lessonId: input.lessonId ?? null,
      status: input.status ?? 'draft',
      sourceType: input.sourceType ?? 'human',
      version: 1,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.bySlug.set(row.slug, row);
    return row;
  }

  async update(slug: string, patch: UpdateQuizInput, editedBy?: string): Promise<Quiz> {
    const current = this.bySlug.get(slug);
    if (!current) throw new NotFoundError('quiz', slug);
    snapshotRevision(this.revisions, 'quiz', current, editedBy);
    const updated: Quiz = {
      ...current,
      title: patch.title ?? current.title,
      courseId: patch.courseId ?? current.courseId,
      lessonId: patch.lessonId ?? current.lessonId,
      status: patch.status ?? current.status,
      sourceType: patch.sourceType ?? current.sourceType,
      version: current.version + 1,
      updatedAt: new Date(),
    };
    this.bySlug.set(slug, updated);
    return updated;
  }

  async remove(slug: string): Promise<void> {
    this.bySlug.delete(slug);
  }
}

export class InMemoryQuizQuestionRepository implements QuizQuestionRepository {
  private rows = new Map<string, QuizQuestion>();

  async listByQuiz(quizId: string): Promise<QuizQuestion[]> {
    return [...this.rows.values()].filter((q) => q.quizId === quizId).sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async create(input: CreateQuizQuestionInput): Promise<QuizQuestion> {
    const orderIndex = input.orderIndex ?? 0;
    const duplicate = [...this.rows.values()].some((q) => q.quizId === input.quizId && q.orderIndex === orderIndex);
    if (duplicate) throw new DuplicateError(`quiz already has a question at order_index ${orderIndex}`);
    const row: QuizQuestion = {
      id: randomUUID(),
      quizId: input.quizId,
      question: input.question,
      options: input.options,
      correctOptionIndex: input.correctOptionIndex,
      explanation: input.explanation ?? null,
      orderIndex,
      createdAt: new Date(),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async update(id: string, patch: UpdateQuizQuestionInput): Promise<QuizQuestion> {
    const current = this.rows.get(id);
    if (!current) throw new NotFoundError('quiz question', id);
    const updated: QuizQuestion = {
      ...current,
      question: patch.question ?? current.question,
      options: patch.options ?? current.options,
      correctOptionIndex: patch.correctOptionIndex ?? current.correctOptionIndex,
      explanation: patch.explanation ?? current.explanation,
      orderIndex: patch.orderIndex ?? current.orderIndex,
    };
    this.rows.set(id, updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    this.rows.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Content tags -- depends concretely on InMemoryTagRepository (not just the
// TagRepository port) so listForContent() can resolve a tagId back to a full
// EducationTag via its test-only getById(), the same way
// DrizzleContentTagRepository's innerJoin does for real.
// ---------------------------------------------------------------------------

export class InMemoryContentTagRepository implements ContentTagRepository {
  private rows: EducationContentTag[] = [];

  constructor(private readonly tagRepo: InMemoryTagRepository) {}

  async attach(contentType: ContentType, contentId: string, tagId: string): Promise<void> {
    const exists = this.rows.some(
      (r) => r.contentType === contentType && r.contentId === contentId && r.tagId === tagId,
    );
    if (exists) throw new DuplicateError(`tag ${tagId} is already attached to this ${contentType}`);
    this.rows.push({ id: randomUUID(), contentType, contentId, tagId, createdAt: new Date() });
  }

  async detach(contentType: ContentType, contentId: string, tagId: string): Promise<void> {
    this.rows = this.rows.filter(
      (r) => !(r.contentType === contentType && r.contentId === contentId && r.tagId === tagId),
    );
  }

  async listForContent(contentType: ContentType, contentId: string): Promise<EducationTag[]> {
    return this.rows
      .filter((r) => r.contentType === contentType && r.contentId === contentId)
      .map((r) => this.tagRepo.getById(r.tagId))
      .filter((t): t is EducationTag => t !== undefined);
  }
}

// ---------------------------------------------------------------------------
// Revisions -- read-only view over the same RevisionLog array the content
// repo fakes above were constructed with.
// ---------------------------------------------------------------------------

export class InMemoryRevisionRepository implements RevisionRepository {
  constructor(private readonly revisions: RevisionLog = []) {}

  async listForContent(contentType: ContentType, contentId: string): Promise<EducationContentRevision[]> {
    return this.revisions
      .filter((r) => r.contentType === contentType && r.contentId === contentId)
      .sort((a, b) => a.version - b.version);
  }
}

// ---------------------------------------------------------------------------
// Per-user progress
// ---------------------------------------------------------------------------

export class InMemoryProgressRepository implements ProgressRepository {
  private byKey = new Map<string, EducationUserProgress>();

  private key(userId: string, contentType: ContentType, contentId: string): string {
    return `${userId}::${contentType}::${contentId}`;
  }

  async upsert(input: UpsertProgressInput): Promise<EducationUserProgress> {
    const key = this.key(input.userId, input.contentType, input.contentId);
    const existing = this.byKey.get(key);
    const completedAt = input.status === 'completed' ? new Date() : null;
    const row: EducationUserProgress = {
      id: existing?.id ?? randomUUID(),
      userId: input.userId,
      contentType: input.contentType,
      contentId: input.contentId,
      status: input.status,
      progressPct: input.progressPct ?? 0,
      lastAccessedAt: new Date(),
      completedAt,
      createdAt: existing?.createdAt ?? new Date(),
    };
    this.byKey.set(key, row);
    return row;
  }

  async listForUser(userId: string): Promise<EducationUserProgress[]> {
    return [...this.byKey.values()].filter((r) => r.userId === userId);
  }
}

// ---------------------------------------------------------------------------
// Quiz attempts
// ---------------------------------------------------------------------------

export class InMemoryQuizAttemptRepository implements QuizAttemptRepository {
  private rows: QuizAttempt[] = [];

  async record(input: RecordQuizAttemptInput): Promise<QuizAttempt> {
    const row: QuizAttempt = {
      id: randomUUID(),
      userId: input.userId,
      quizId: input.quizId,
      score: input.score,
      totalQuestions: input.totalQuestions,
      answers: input.answers,
      completedAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }

  async listForUser(userId: string, quizId?: string): Promise<QuizAttempt[]> {
    return this.rows.filter((r) => r.userId === userId && (quizId === undefined || r.quizId === quizId));
  }
}
