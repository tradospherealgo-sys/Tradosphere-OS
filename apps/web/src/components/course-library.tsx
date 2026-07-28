'use client';

// Task 10.5: Course library. listCourses()/listLessons() already return the
// full Course/Lesson rows (lessons include `content` in full) -- a superset
// of what a separate getCourse()/getLesson() call would add, so selecting a
// course/lesson for detail view reads from the already-fetched list rather
// than issuing a redundant network call, same discipline as 10.4's
// summary()/performance() superset reasoning.
import { useEffect, useState } from 'react';
import { SdkHttpError } from '@tradosphere/sdk';
import type { Course, EducationDifficulty, Lesson, Progress } from '@tradosphere/sdk';
import { sdk } from '@/lib/sdk';
import { ProgressControl } from './progress-control';

type SectionState<T> =
  { phase: 'loading' } | { phase: 'loaded'; data: T } | { phase: 'error'; message: string };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof SdkHttpError ? err.message : fallback;
}

const DIFFICULTIES: EducationDifficulty[] = ['beginner', 'intermediate', 'advanced'];

export function CourseLibrary({
  categoryNames,
  progressFor,
  onMarkProgress,
}: {
  categoryNames: Record<string, string>;
  progressFor: (contentType: 'course' | 'lesson', contentId: string) => Progress | undefined;
  onMarkProgress: (
    contentType: 'course' | 'lesson',
    contentId: string,
    status: Progress['status'],
  ) => void;
}) {
  const [difficulty, setDifficulty] = useState<EducationDifficulty | ''>('');
  const [courses, setCourses] = useState<SectionState<Course[]>>({ phase: 'loading' });
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [lessons, setLessons] = useState<SectionState<Lesson[]>>({ phase: 'loading' });
  const [selectedLessonSlug, setSelectedLessonSlug] = useState<string | null>(null);

  async function loadCourses() {
    setCourses({ phase: 'loading' });
    try {
      const data = await sdk.education.listCourses(difficulty ? { difficulty } : {});
      setCourses({ phase: 'loaded', data });
    } catch (err) {
      setCourses({
        phase: 'error',
        message: errorMessage(err, 'Could not reach the education service.'),
      });
    }
  }

  useEffect(() => {
    loadCourses();
    setSelectedSlug(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty]);

  useEffect(() => {
    if (!selectedSlug) return;
    setSelectedLessonSlug(null);
    setLessons({ phase: 'loading' });
    sdk.education
      .listLessons(selectedSlug)
      .then((data) => setLessons({ phase: 'loaded', data }))
      .catch((err) =>
        setLessons({
          phase: 'error',
          message: errorMessage(err, 'Could not reach the education service.'),
        }),
      );
  }, [selectedSlug]);

  const selectedCourse =
    courses.phase === 'loaded' ? courses.data.find((c) => c.slug === selectedSlug) : undefined;
  const selectedLesson =
    lessons.phase === 'loaded'
      ? lessons.data.find((l) => l.slug === selectedLessonSlug)
      : undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="courses-heading"
      >
        <div className="flex items-center justify-between">
          <h2 id="courses-heading" className="text-sm font-medium">
            Courses
          </h2>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as EducationDifficulty | '')}
            aria-label="Filter by difficulty"
            className="rounded-md border border-border bg-bg px-2 py-1 text-xs"
          >
            <option value="">All difficulties</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {courses.phase === 'loading' && (
          <p className="mt-3 text-sm text-muted" role="status">
            Loading…
          </p>
        )}
        {courses.phase === 'error' && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {courses.message}
          </p>
        )}
        {courses.phase === 'loaded' && courses.data.length === 0 && (
          <p className="mt-3 text-sm text-muted" role="status">
            No courses published yet.
          </p>
        )}
        {courses.phase === 'loaded' && courses.data.length > 0 && (
          <ul className="mt-3 space-y-1" role="list">
            {courses.data.map((course) => {
              const progress = progressFor('course', course.id);
              return (
                <li key={course.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedSlug(course.slug)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                      selectedSlug === course.slug ? 'border-accent bg-bg' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{course.title}</span>
                      {progress && <span className="text-xs text-muted">{progress.status}</span>}
                    </div>
                    <span className="text-xs text-muted">
                      {course.difficulty}
                      {course.categoryId && categoryNames[course.categoryId]
                        ? ` · ${categoryNames[course.categoryId]}`
                        : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="course-detail-heading"
      >
        <h2 id="course-detail-heading" className="text-sm font-medium">
          Course detail
        </h2>

        {!selectedCourse && (
          <p className="mt-3 text-sm text-muted" role="status">
            Select a course to see its lessons.
          </p>
        )}

        {selectedCourse && (
          <>
            <p className="mt-2 text-sm">{selectedCourse.description}</p>
            <ProgressControl
              progress={progressFor('course', selectedCourse.id)}
              onMark={(status) => onMarkProgress('course', selectedCourse.id, status)}
            />

            <h3 className="mt-4 text-xs font-medium text-muted">Lessons</h3>
            {lessons.phase === 'loading' && (
              <p className="mt-2 text-sm text-muted" role="status">
                Loading…
              </p>
            )}
            {lessons.phase === 'error' && (
              <p className="mt-2 text-sm text-danger" role="alert">
                {lessons.message}
              </p>
            )}
            {lessons.phase === 'loaded' && lessons.data.length === 0 && (
              <p className="mt-2 text-sm text-muted" role="status">
                No lessons published for this course yet.
              </p>
            )}
            {lessons.phase === 'loaded' && lessons.data.length > 0 && (
              <ul className="mt-2 space-y-1" role="list">
                {lessons.data
                  .slice()
                  .sort((a, b) => a.orderIndex - b.orderIndex)
                  .map((lesson) => (
                    <li key={lesson.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedLessonSlug(lesson.slug)}
                        className={`w-full rounded-md border px-2 py-1.5 text-left text-xs ${
                          selectedLessonSlug === lesson.slug
                            ? 'border-accent bg-bg'
                            : 'border-border'
                        }`}
                      >
                        {lesson.title}
                      </button>
                    </li>
                  ))}
              </ul>
            )}

            {selectedLesson && (
              <div className="mt-3 rounded-md border border-border p-3">
                <h4 className="text-sm font-medium">{selectedLesson.title}</h4>
                <p className="mt-2 whitespace-pre-wrap text-sm text-text">
                  {selectedLesson.content}
                </p>
                <ProgressControl
                  progress={progressFor('lesson', selectedLesson.id)}
                  onMark={(status) => onMarkProgress('lesson', selectedLesson.id, status)}
                />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
