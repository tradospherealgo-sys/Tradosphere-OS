'use client';

// Task 10.6: Search. Federates the real per-content-type `?search=` query
// param that GET /v1/education/{courses,glossary,strategies} already support
// (confirmed by reading openapi.yaml's three parameter blocks and
// packages/sdk/src/education.ts's EducationListFilter/
// EducationListCoursesFilter before writing this file) into one input.
// Quizzes and lessons are deliberately excluded from this screen: the
// quizzes list route has no `search` parameter at all in the spec, and
// lessons are nested under a specific course slug with no top-level
// "search every lesson" route -- searching either here would mean either
// faking a client-side filter and presenting it as a real search, or
// guessing which course to search, both of which Vega charter rule 1
// forbids. This gap is logged in EXECUTION_BOOK.md's Sprint 10.6 section for
// Sprint 11+.
import { useState, type FormEvent } from 'react';
import { SdkHttpError } from '@tradosphere/sdk';
import type { Course, GlossaryTerm, Strategy } from '@tradosphere/sdk';
import { sdk } from '@/lib/sdk';

type SectionState<T> =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'loaded'; data: T[] }
  | { phase: 'error'; message: string };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof SdkHttpError ? err.message : fallback;
}

function ResultSection<T>({
  headingId,
  title,
  state,
  renderItem,
  keyOf,
}: {
  headingId: string;
  title: string;
  state: SectionState<T>;
  renderItem: (item: T) => { title: string; body: string };
  keyOf: (item: T) => string;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-sm font-medium">
        {title}
      </h2>
      {state.phase === 'idle' && (
        <p className="mt-3 text-sm text-muted" role="status">
          Enter a search term above.
        </p>
      )}
      {state.phase === 'loading' && (
        <p className="mt-3 text-sm text-muted" role="status">
          Loading…
        </p>
      )}
      {state.phase === 'error' && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}
      {state.phase === 'loaded' && state.data.length === 0 && (
        <p className="mt-3 text-sm text-muted" role="status">
          No matches.
        </p>
      )}
      {state.phase === 'loaded' && state.data.length > 0 && (
        <ul className="mt-3 space-y-2" role="list">
          {state.data.map((item) => {
            const { title: itemTitle, body } = renderItem(item);
            return (
              <li key={keyOf(item)} className="rounded-md border border-border p-2 text-sm">
                <p className="font-medium">{itemTitle}</p>
                <p className="mt-1 text-xs text-muted">{body}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [courses, setCourses] = useState<SectionState<Course>>({ phase: 'idle' });
  const [terms, setTerms] = useState<SectionState<GlossaryTerm>>({ phase: 'idle' });
  const [strategies, setStrategies] = useState<SectionState<Strategy>>({ phase: 'idle' });

  function runSearch(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setCourses({ phase: 'loading' });
    sdk.education
      .listCourses({ search: trimmed })
      .then((data) => setCourses({ phase: 'loaded', data }))
      .catch((err) =>
        setCourses({
          phase: 'error',
          message: errorMessage(err, 'Could not reach the education service.'),
        }),
      );

    setTerms({ phase: 'loading' });
    sdk.education
      .listGlossaryTerms({ search: trimmed })
      .then((data) => setTerms({ phase: 'loaded', data }))
      .catch((err) =>
        setTerms({
          phase: 'error',
          message: errorMessage(err, 'Could not reach the education service.'),
        }),
      );

    setStrategies({ phase: 'loading' });
    sdk.education
      .listStrategies({ search: trimmed })
      .then((data) => setStrategies({ phase: 'loaded', data }))
      .catch((err) =>
        setStrategies({
          phase: 'error',
          message: errorMessage(err, 'Could not reach the education service.'),
        }),
      );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={runSearch} className="flex flex-wrap gap-2">
        <label htmlFor="global-search-input" className="sr-only">
          Search courses, glossary, and strategies
        </label>
        <input
          id="global-search-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses, glossary terms, strategies…"
          className="w-full max-w-md rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Search
        </button>
      </form>

      <p className="text-xs text-muted">
        Searches real Education content only (courses, glossary, strategies) — the only content
        types the backend supports server-side search on. Quizzes and individual lessons aren&apos;t
        searchable yet.
      </p>

      <ResultSection
        headingId="search-courses-heading"
        title="Courses"
        state={courses}
        keyOf={(c) => c.id}
        renderItem={(c) => ({ title: c.title, body: c.description })}
      />
      <ResultSection
        headingId="search-glossary-heading"
        title="Glossary"
        state={terms}
        keyOf={(t) => t.id}
        renderItem={(t) => ({ title: t.term, body: t.definition })}
      />
      <ResultSection
        headingId="search-strategies-heading"
        title="Strategies"
        state={strategies}
        keyOf={(s) => s.id}
        renderItem={(s) => ({ title: s.name, body: s.description })}
      />
    </div>
  );
}
