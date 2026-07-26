// Task 9.6: all 27 /v1/education routes (proxied verbatim to
// services/education per Decision D20). Most reads are unauthenticated
// (security: [] in openapi.yaml); writes are admin-only and enforced
// server-side -- the SDK does not duplicate that check, it just forwards
// whatever token the caller configured.
import type { HttpClient, QueryValue } from './http';
import type {
  AttachTagInput,
  Category,
  ContentRevision,
  ContentTag,
  Course,
  CreateCategoryInput,
  CreateCourseInput,
  CreateGlossaryTermInput,
  CreateLessonInput,
  CreateQuizInput,
  CreateQuizQuestionInput,
  CreateStrategyInput,
  CreateTagInput,
  EducationContentStatus,
  EducationContentType,
  EducationDifficulty,
  GlossaryTerm,
  Lesson,
  Progress,
  PublicQuizQuestion,
  Quiz,
  QuizAttempt,
  QuizQuestion,
  Strategy,
  SubmitQuizAttemptInput,
  Tag,
  TutorExplainInput,
  UpdateCourseInput,
  UpdateGlossaryTermInput,
  UpdateLessonInput,
  UpdateQuizInput,
  UpdateQuizQuestionInput,
  UpdateStrategyInput,
  UpsertProgressInput,
  AnnotateTradeIdeaInput,
} from './types';
import type { ExpertOpinion, TradeIdea } from '@tradosphere/shared-types';

export interface EducationListFilter {
  [key: string]: QueryValue;
  categoryId?: string;
  status?: EducationContentStatus;
  search?: string;
}

export interface EducationListCoursesFilter extends EducationListFilter {
  difficulty?: EducationDifficulty;
}

export interface EducationListLessonsFilter {
  [key: string]: QueryValue;
  status?: EducationContentStatus;
  search?: string;
}

export interface EducationListQuizzesFilter {
  [key: string]: QueryValue;
  status?: EducationContentStatus;
  courseId?: string;
}

export class EducationClient {
  constructor(private readonly http: HttpClient) {}

  // ---- Categories ----
  listCategories(): Promise<Category[]> {
    return this.http.request('GET', '/v1/education/categories', { skipAuth: true });
  }
  createCategory(input: CreateCategoryInput): Promise<Category> {
    return this.http.request('POST', '/v1/education/categories', { body: input });
  }

  // ---- Tags ----
  listTags(): Promise<Tag[]> {
    return this.http.request('GET', '/v1/education/tags', { skipAuth: true });
  }
  createTag(input: CreateTagInput): Promise<Tag> {
    return this.http.request('POST', '/v1/education/tags', { body: input });
  }

  // ---- Glossary ----
  listGlossaryTerms(filter: EducationListFilter = {}): Promise<GlossaryTerm[]> {
    return this.http.request('GET', '/v1/education/glossary', { query: filter, skipAuth: true });
  }
  createGlossaryTerm(input: CreateGlossaryTermInput): Promise<GlossaryTerm> {
    return this.http.request('POST', '/v1/education/glossary', { body: input });
  }
  getGlossaryTerm(slug: string): Promise<GlossaryTerm> {
    return this.http.request('GET', `/v1/education/glossary/${encodeURIComponent(slug)}`, { skipAuth: true });
  }
  updateGlossaryTerm(slug: string, input: UpdateGlossaryTermInput): Promise<GlossaryTerm> {
    return this.http.request('PATCH', `/v1/education/glossary/${encodeURIComponent(slug)}`, { body: input });
  }
  deleteGlossaryTerm(slug: string): Promise<void> {
    return this.http.request('DELETE', `/v1/education/glossary/${encodeURIComponent(slug)}`);
  }

  // ---- Courses ----
  listCourses(filter: EducationListCoursesFilter = {}): Promise<Course[]> {
    return this.http.request('GET', '/v1/education/courses', { query: filter, skipAuth: true });
  }
  createCourse(input: CreateCourseInput): Promise<Course> {
    return this.http.request('POST', '/v1/education/courses', { body: input });
  }
  getCourse(slug: string): Promise<Course> {
    return this.http.request('GET', `/v1/education/courses/${encodeURIComponent(slug)}`, { skipAuth: true });
  }
  updateCourse(slug: string, input: UpdateCourseInput): Promise<Course> {
    return this.http.request('PATCH', `/v1/education/courses/${encodeURIComponent(slug)}`, { body: input });
  }
  deleteCourse(slug: string): Promise<void> {
    return this.http.request('DELETE', `/v1/education/courses/${encodeURIComponent(slug)}`);
  }

  // ---- Lessons (nested under a course) ----
  listLessons(courseSlug: string, filter: EducationListLessonsFilter = {}): Promise<Lesson[]> {
    return this.http.request('GET', `/v1/education/courses/${encodeURIComponent(courseSlug)}/lessons`, {
      query: filter,
      skipAuth: true,
    });
  }
  createLesson(courseSlug: string, input: CreateLessonInput): Promise<Lesson> {
    return this.http.request('POST', `/v1/education/courses/${encodeURIComponent(courseSlug)}/lessons`, {
      body: input,
    });
  }
  getLesson(courseSlug: string, slug: string): Promise<Lesson> {
    return this.http.request(
      'GET',
      `/v1/education/courses/${encodeURIComponent(courseSlug)}/lessons/${encodeURIComponent(slug)}`,
      { skipAuth: true },
    );
  }
  updateLesson(courseSlug: string, slug: string, input: UpdateLessonInput): Promise<Lesson> {
    return this.http.request(
      'PATCH',
      `/v1/education/courses/${encodeURIComponent(courseSlug)}/lessons/${encodeURIComponent(slug)}`,
      { body: input },
    );
  }
  deleteLesson(courseSlug: string, slug: string): Promise<void> {
    return this.http.request(
      'DELETE',
      `/v1/education/courses/${encodeURIComponent(courseSlug)}/lessons/${encodeURIComponent(slug)}`,
    );
  }

  // ---- Strategies ----
  listStrategies(filter: EducationListCoursesFilter = {}): Promise<Strategy[]> {
    return this.http.request('GET', '/v1/education/strategies', { query: filter, skipAuth: true });
  }
  createStrategy(input: CreateStrategyInput): Promise<Strategy> {
    return this.http.request('POST', '/v1/education/strategies', { body: input });
  }
  getStrategy(slug: string): Promise<Strategy> {
    return this.http.request('GET', `/v1/education/strategies/${encodeURIComponent(slug)}`, { skipAuth: true });
  }
  updateStrategy(slug: string, input: UpdateStrategyInput): Promise<Strategy> {
    return this.http.request('PATCH', `/v1/education/strategies/${encodeURIComponent(slug)}`, { body: input });
  }
  deleteStrategy(slug: string): Promise<void> {
    return this.http.request('DELETE', `/v1/education/strategies/${encodeURIComponent(slug)}`);
  }

  // ---- Quizzes ----
  listQuizzes(filter: EducationListQuizzesFilter = {}): Promise<Quiz[]> {
    return this.http.request('GET', '/v1/education/quizzes', { query: filter, skipAuth: true });
  }
  createQuiz(input: CreateQuizInput): Promise<Quiz> {
    return this.http.request('POST', '/v1/education/quizzes', { body: input });
  }
  getQuiz(slug: string): Promise<Quiz> {
    return this.http.request('GET', `/v1/education/quizzes/${encodeURIComponent(slug)}`, { skipAuth: true });
  }
  updateQuiz(slug: string, input: UpdateQuizInput): Promise<Quiz> {
    return this.http.request('PATCH', `/v1/education/quizzes/${encodeURIComponent(slug)}`, { body: input });
  }
  deleteQuiz(slug: string): Promise<void> {
    return this.http.request('DELETE', `/v1/education/quizzes/${encodeURIComponent(slug)}`);
  }

  /** Redacted -- no correctOptionIndex/explanation. Public, unauthenticated. */
  listPublicQuizQuestions(slug: string): Promise<PublicQuizQuestion[]> {
    return this.http.request('GET', `/v1/education/quizzes/${encodeURIComponent(slug)}/questions`, {
      skipAuth: true,
    });
  }
  createQuizQuestion(slug: string, input: CreateQuizQuestionInput): Promise<QuizQuestion> {
    return this.http.request('POST', `/v1/education/quizzes/${encodeURIComponent(slug)}/questions`, {
      body: input,
    });
  }
  /** Admin only -- full rows including the answer key. */
  getQuizAnswerKey(slug: string): Promise<QuizQuestion[]> {
    return this.http.request('GET', `/v1/education/quizzes/${encodeURIComponent(slug)}/answer-key`);
  }
  updateQuizQuestion(slug: string, id: string, input: UpdateQuizQuestionInput): Promise<QuizQuestion> {
    return this.http.request(
      'PATCH',
      `/v1/education/quizzes/${encodeURIComponent(slug)}/questions/${encodeURIComponent(id)}`,
      { body: input },
    );
  }
  deleteQuizQuestion(slug: string, id: string): Promise<void> {
    return this.http.request(
      'DELETE',
      `/v1/education/quizzes/${encodeURIComponent(slug)}/questions/${encodeURIComponent(id)}`,
    );
  }

  /** userId is taken from the caller's JWT server-side, never the body. */
  submitQuizAttempt(slug: string, input: SubmitQuizAttemptInput): Promise<QuizAttempt> {
    return this.http.request('POST', `/v1/education/quizzes/${encodeURIComponent(slug)}/attempts`, {
      body: input,
    });
  }
  listQuizAttemptsForQuiz(slug: string): Promise<QuizAttempt[]> {
    return this.http.request('GET', `/v1/education/quizzes/${encodeURIComponent(slug)}/attempts`);
  }
  listMyQuizAttempts(): Promise<QuizAttempt[]> {
    return this.http.request('GET', '/v1/education/attempts');
  }

  // ---- Content tags (polymorphic: contentType/contentId) ----
  listContentTags(contentType: EducationContentType, contentId: string): Promise<ContentTag[]> {
    return this.http.request(
      'GET',
      `/v1/education/content/${contentType}/${encodeURIComponent(contentId)}/tags`,
      { skipAuth: true },
    );
  }
  attachContentTag(contentType: EducationContentType, contentId: string, input: AttachTagInput): Promise<void> {
    return this.http.request(
      'POST',
      `/v1/education/content/${contentType}/${encodeURIComponent(contentId)}/tags`,
      { body: input },
    );
  }
  detachContentTag(contentType: EducationContentType, contentId: string, tagId: string): Promise<void> {
    return this.http.request(
      'DELETE',
      `/v1/education/content/${contentType}/${encodeURIComponent(contentId)}/tags/${encodeURIComponent(tagId)}`,
    );
  }

  /** Admin only -- revision snapshots carry editedBy user ids. */
  listContentRevisions(contentType: EducationContentType, contentId: string): Promise<ContentRevision[]> {
    return this.http.request(
      'GET',
      `/v1/education/content/${contentType}/${encodeURIComponent(contentId)}/revisions`,
    );
  }

  // ---- Progress ----
  /** Idempotent upsert keyed on (caller's userId, contentType, contentId). */
  upsertProgress(
    contentType: EducationContentType,
    contentId: string,
    input: UpsertProgressInput,
  ): Promise<Progress> {
    return this.http.request(
      'PUT',
      `/v1/education/progress/${contentType}/${encodeURIComponent(contentId)}`,
      { body: input },
    );
  }
  listMyProgress(): Promise<Progress[]> {
    return this.http.request('GET', '/v1/education/progress');
  }

  // ---- AI tutor / annotation (any authenticated role) ----
  tutorExplain(input: TutorExplainInput): Promise<ExpertOpinion> {
    return this.http.request('POST', '/v1/education/tutor/explain', { body: input });
  }
  /** Admin only, per Decision D12. */
  annotateTradeIdea(input: AnnotateTradeIdeaInput): Promise<TradeIdea> {
    return this.http.request('POST', '/v1/education/annotations/trade-idea', { body: input });
  }
}
