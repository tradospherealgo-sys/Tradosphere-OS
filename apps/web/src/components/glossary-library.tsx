'use client';

// Task 10.5: Glossary. listGlossaryTerms() already returns the full term
// row (definition included) -- selecting a term for detail just reads the
// already-fetched list item, no separate getGlossaryTerm() call.
import { useEffect, useState } from 'react';
import { SdkHttpError } from '@tradosphere/sdk';
import type { GlossaryTerm, Progress } from '@tradosphere/sdk';
import { sdk } from '@/lib/sdk';
import { ProgressControl } from './progress-control';

type SectionState<T> =
  { phase: 'loading' } | { phase: 'loaded'; data: T } | { phase: 'error'; message: string };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof SdkHttpError ? err.message : fallback;
}

export function GlossaryLibrary({
  progressFor,
  onMarkProgress,
}: {
  progressFor: (contentType: 'glossary_term', contentId: string) => Progress | undefined;
  onMarkProgress: (
    contentType: 'glossary_term',
    contentId: string,
    status: Progress['status'],
  ) => void;
}) {
  const [search, setSearch] = useState('');
  const [terms, setTerms] = useState<SectionState<GlossaryTerm[]>>({ phase: 'loading' });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load(searchValue: string) {
    setTerms({ phase: 'loading' });
    try {
      const data = await sdk.education.listGlossaryTerms(
        searchValue ? { search: searchValue } : {},
      );
      setTerms({ phase: 'loaded', data });
    } catch (err) {
      setTerms({
        phase: 'error',
        message: errorMessage(err, 'Could not reach the education service.'),
      });
    }
  }

  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    load(search.trim());
  }

  return (
    <section
      className="rounded-lg border border-border bg-surface p-4"
      aria-labelledby="glossary-heading"
    >
      <h2 id="glossary-heading" className="text-sm font-medium">
        Glossary
      </h2>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <label htmlFor="glossary-search" className="sr-only">
          Search glossary
        </label>
        <input
          id="glossary-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search terms…"
          className="w-56 rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={terms.phase === 'loading'}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {terms.phase === 'loading' && (
        <p className="mt-3 text-sm text-muted" role="status">
          Loading…
        </p>
      )}
      {terms.phase === 'error' && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {terms.message}
        </p>
      )}
      {terms.phase === 'loaded' && terms.data.length === 0 && (
        <p className="mt-3 text-sm text-muted" role="status">
          No glossary terms match.
        </p>
      )}
      {terms.phase === 'loaded' && terms.data.length > 0 && (
        <ul className="mt-3 space-y-1" role="list">
          {terms.data.map((term) => (
            <li key={term.id} className="rounded-md border border-border p-2">
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === term.id ? null : term.id)}
                className="flex w-full items-center justify-between text-left text-sm font-medium"
              >
                {term.term}
                <span className="text-xs text-muted">
                  {expandedId === term.id ? 'Hide' : 'Show'}
                </span>
              </button>
              {expandedId === term.id && (
                <div className="mt-2">
                  <p className="text-sm text-text">{term.definition}</p>
                  <ProgressControl
                    progress={progressFor('glossary_term', term.id)}
                    onMark={(status) => onMarkProgress('glossary_term', term.id, status)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
