'use client';

// Task 10.5: Education Center. Composes the four real content libraries
// (courses, glossary, strategies, quizzes) under one tabbed screen -- one
// nav item per SPRINT_BOOK.md's 10.5 row and nav-items.ts's single
// "Education Center" entry. Progress is fetched once here via
// listMyProgress() and shared down to every sub-tab as a single
// contentType:contentId map, so switching tabs never re-fetches the same
// progress rows. markProgress() calls the real idempotent PUT
// .../progress/{contentType}/{contentId} and updates the shared map from
// that response directly (the PUT already returns the updated Progress row
// -- no follow-up listMyProgress() re-fetch needed, same superset-avoidance
// discipline as 10.4). Categories are fetched once for friendly labels on
// course/strategy cards; if a category lookup ever misses, the raw
// categoryId section is simply omitted rather than shown as broken text.
import { useEffect, useState } from 'react';
import { SdkHttpError } from '@tradosphere/sdk';
import type { Category, EducationContentType, Progress } from '@tradosphere/sdk';
import { sdk } from '@/lib/sdk';
import { CourseLibrary } from './course-library';
import { GlossaryLibrary } from './glossary-library';
import { StrategyLibrary } from './strategy-library';
import { QuizLibrary } from './quiz-library';

type Tab = 'courses' | 'glossary' | 'strategies' | 'quizzes';

const TABS: { key: Tab; label: string }[] = [
  { key: 'courses', label: 'Courses' },
  { key: 'glossary', label: 'Glossary' },
  { key: 'strategies', label: 'Strategies' },
  { key: 'quizzes', label: 'Quizzes' },
];

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof SdkHttpError ? err.message : fallback;
}

export function EducationCenter() {
  const [tab, setTab] = useState<Tab>('courses');
  const [categoryNames, setCategoryNames] = useState<Record<string, string>>({});
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
  const [progressError, setProgressError] = useState<string | null>(null);

  useEffect(() => {
    sdk.education
      .listCategories()
      .then((data: Category[]) => {
        const names: Record<string, string> = {};
        for (const c of data) names[c.id] = c.name;
        setCategoryNames(names);
      })
      .catch(() => {
        // Friendly labels only -- if this fails, cards just show without a
        // category label rather than blocking the rest of the screen.
      });

    sdk.education
      .listMyProgress()
      .then((data: Progress[]) => {
        const map: Record<string, Progress> = {};
        for (const p of data) map[`${p.contentType}:${p.contentId}`] = p;
        setProgressMap(map);
      })
      .catch((err) => setProgressError(errorMessage(err, 'Could not load your progress.')));
  }, []);

  function progressFor(contentType: EducationContentType, contentId: string): Progress | undefined {
    return progressMap[`${contentType}:${contentId}`];
  }

  async function markProgress(
    contentType: EducationContentType,
    contentId: string,
    status: Progress['status'],
  ) {
    try {
      const updated = await sdk.education.upsertProgress(contentType, contentId, { status });
      setProgressMap((prev) => ({ ...prev, [`${contentType}:${contentId}`]: updated }));
    } catch (err) {
      setProgressError(errorMessage(err, 'Could not save your progress.'));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === t.key ? 'border-b-2 border-accent text-text' : 'text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {progressError && (
        <p className="text-sm text-danger" role="alert">
          {progressError}
        </p>
      )}

      {tab === 'courses' && (
        <CourseLibrary
          categoryNames={categoryNames}
          progressFor={progressFor}
          onMarkProgress={markProgress}
        />
      )}
      {tab === 'glossary' && (
        <GlossaryLibrary progressFor={progressFor} onMarkProgress={markProgress} />
      )}
      {tab === 'strategies' && (
        <StrategyLibrary
          categoryNames={categoryNames}
          progressFor={progressFor}
          onMarkProgress={markProgress}
        />
      )}
      {tab === 'quizzes' && <QuizLibrary progressFor={progressFor} onMarkProgress={markProgress} />}
    </div>
  );
}
