'use client';

// Task 10.5: Strategy library. listStrategies() already returns the full
// Strategy row (description included) -- selecting one for detail reads the
// already-fetched list item, no separate getStrategy() call.
import { useEffect, useState } from 'react';
import { SdkHttpError } from '@tradosphere/sdk';
import type { EducationDifficulty, Progress, Strategy } from '@tradosphere/sdk';
import { sdk } from '@/lib/sdk';
import { ProgressControl } from './progress-control';

type SectionState<T> =
  { phase: 'loading' } | { phase: 'loaded'; data: T } | { phase: 'error'; message: string };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof SdkHttpError ? err.message : fallback;
}

const DIFFICULTIES: EducationDifficulty[] = ['beginner', 'intermediate', 'advanced'];

export function StrategyLibrary({
  categoryNames,
  progressFor,
  onMarkProgress,
}: {
  categoryNames: Record<string, string>;
  progressFor: (contentType: 'strategy', contentId: string) => Progress | undefined;
  onMarkProgress: (contentType: 'strategy', contentId: string, status: Progress['status']) => void;
}) {
  const [difficulty, setDifficulty] = useState<EducationDifficulty | ''>('');
  const [strategies, setStrategies] = useState<SectionState<Strategy[]>>({ phase: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load() {
    setStrategies({ phase: 'loading' });
    try {
      const data = await sdk.education.listStrategies(difficulty ? { difficulty } : {});
      setStrategies({ phase: 'loaded', data });
    } catch (err) {
      setStrategies({
        phase: 'error',
        message: errorMessage(err, 'Could not reach the education service.'),
      });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty]);

  const selected =
    strategies.phase === 'loaded' ? strategies.data.find((s) => s.id === selectedId) : undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="strategies-heading"
      >
        <div className="flex items-center justify-between">
          <h2 id="strategies-heading" className="text-sm font-medium">
            Strategies
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

        {strategies.phase === 'loading' && (
          <p className="mt-3 text-sm text-muted" role="status">
            Loading…
          </p>
        )}
        {strategies.phase === 'error' && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {strategies.message}
          </p>
        )}
        {strategies.phase === 'loaded' && strategies.data.length === 0 && (
          <p className="mt-3 text-sm text-muted" role="status">
            No strategies published yet.
          </p>
        )}
        {strategies.phase === 'loaded' && strategies.data.length > 0 && (
          <ul className="mt-3 space-y-1" role="list">
            {strategies.data.map((strategy) => {
              const progress = progressFor('strategy', strategy.id);
              return (
                <li key={strategy.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(strategy.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                      selectedId === strategy.id ? 'border-accent bg-bg' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{strategy.name}</span>
                      {progress && <span className="text-xs text-muted">{progress.status}</span>}
                    </div>
                    <span className="text-xs text-muted">
                      {strategy.difficulty}
                      {strategy.categoryId && categoryNames[strategy.categoryId]
                        ? ` · ${categoryNames[strategy.categoryId]}`
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
        aria-labelledby="strategy-detail-heading"
      >
        <h2 id="strategy-detail-heading" className="text-sm font-medium">
          Strategy detail
        </h2>
        {!selected && (
          <p className="mt-3 text-sm text-muted" role="status">
            Select a strategy to read it.
          </p>
        )}
        {selected && (
          <>
            <p className="mt-2 whitespace-pre-wrap text-sm text-text">{selected.description}</p>
            <ProgressControl
              progress={progressFor('strategy', selected.id)}
              onMark={(status) => onMarkProgress('strategy', selected.id, status)}
            />
          </>
        )}
      </section>
    </div>
  );
}
