'use client';

// Task 10.4: journal -- the durable record of paper trades (Decision D16).
// Lists every real entry from GET /v1/journal/entries and lets an open
// entry's real outcome be recorded via POST .../outcome (write-once server-
// side; recording twice throws a real 409, surfaced here as an error, never
// silently overwritten).
import { useEffect, useState } from 'react';
import { SdkHttpError } from '@tradosphere/sdk';
import type { JournalEntry } from '@tradosphere/sdk';
import { sdk } from '@/lib/sdk';
import { FreshnessNote } from './freshness-note';

type ListState =
  | { phase: 'loading' }
  | { phase: 'loaded'; entries: JournalEntry[]; fetchedAtMs: number }
  | { phase: 'error'; message: string };

type OutcomeFormState = { exitPrice: string; exitAtIso: string };
type OutcomeSubmitState =
  { phase: 'idle' } | { phase: 'saving' } | { phase: 'error'; message: string };

export function JournalList() {
  const [state, setState] = useState<ListState>({ phase: 'loading' });
  const [openForms, setOpenForms] = useState<Record<string, OutcomeFormState>>({});
  const [submitStates, setSubmitStates] = useState<Record<string, OutcomeSubmitState>>({});

  async function load() {
    setState({ phase: 'loading' });
    try {
      const { entries } = await sdk.journal.listEntries();
      setState({ phase: 'loaded', entries, fetchedAtMs: Date.now() });
    } catch (err) {
      const message =
        err instanceof SdkHttpError ? err.message : 'Could not reach the journal service.';
      setState({ phase: 'error', message });
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleOutcomeForm(entryId: string) {
    setOpenForms((prev) => {
      const next = { ...prev };
      if (next[entryId]) {
        delete next[entryId];
      } else {
        next[entryId] = { exitPrice: '', exitAtIso: new Date().toISOString().slice(0, 16) };
      }
      return next;
    });
  }

  async function submitOutcome(entryId: string) {
    const form = openForms[entryId];
    const exitPrice = Number(form?.exitPrice);
    if (!form || !Number.isFinite(exitPrice) || !form.exitAtIso) return;

    setSubmitStates((prev) => ({ ...prev, [entryId]: { phase: 'saving' } }));
    try {
      await sdk.journal.recordOutcome(entryId, {
        exitPrice,
        exitAtIso: new Date(form.exitAtIso).toISOString(),
      });
      setSubmitStates((prev) => ({ ...prev, [entryId]: { phase: 'idle' } }));
      setOpenForms((prev) => {
        const next = { ...prev };
        delete next[entryId];
        return next;
      });
      await load();
    } catch (err) {
      const message =
        err instanceof SdkHttpError ? err.message : 'Could not reach the journal service.';
      setSubmitStates((prev) => ({ ...prev, [entryId]: { phase: 'error', message } }));
    }
  }

  return (
    <section
      className="rounded-lg border border-border bg-surface p-4"
      aria-labelledby="journal-heading"
    >
      <div className="flex items-center justify-between">
        <h2 id="journal-heading" className="text-sm font-medium">
          Journal
        </h2>
        {state.phase === 'loaded' && <FreshnessNote atMs={state.fetchedAtMs} />}
      </div>
      <p className="mt-1 text-xs text-muted">
        Every real paper trade recorded via the journal service, newest first.
      </p>

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

      {state.phase === 'loaded' && state.entries.length === 0 && (
        <p className="mt-3 text-sm text-muted" role="status">
          No journal entries yet. Place a paper order and save it to the journal to see it here.
        </p>
      )}

      {state.phase === 'loaded' && state.entries.length > 0 && (
        <ul className="mt-3 space-y-2" role="list">
          {state.entries.map((entry) => {
            const form = openForms[entry.id];
            const submitState = submitStates[entry.id] ?? { phase: 'idle' };
            return (
              <li key={entry.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {entry.symbol} · {entry.side} · qty {entry.quantity}
                  </span>
                  <span
                    className={
                      entry.status === 'open'
                        ? 'text-xs text-muted'
                        : 'text-xs font-medium text-text'
                    }
                  >
                    {entry.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  filled {entry.fillPrice.toFixed(2)} on{' '}
                  {new Date(entry.filledAtIso).toLocaleString()}
                </p>
                {entry.cioVerdictLabel && (
                  <p className="mt-1 text-xs text-text">
                    CIO verdict at entry: {entry.cioVerdictLabel} ({entry.cioConfidence}%
                    confidence)
                  </p>
                )}
                {entry.status === 'closed' && (
                  <p className="mt-1 text-xs text-text">
                    exit {entry.exitPrice?.toFixed(2)} on{' '}
                    {entry.exitAtIso ? new Date(entry.exitAtIso).toLocaleString() : '—'} · realized
                    P&L {entry.realizedPnl?.toFixed(2)}
                  </p>
                )}

                {entry.status === 'open' && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => toggleOutcomeForm(entry.id)}
                      className="rounded-md border border-border px-2 py-1 text-xs font-medium"
                    >
                      {form ? 'Cancel' : 'Record outcome'}
                    </button>

                    {form && (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <div>
                          <label
                            htmlFor={`exit-price-${entry.id}`}
                            className="block text-xs text-muted"
                          >
                            Exit price
                          </label>
                          <input
                            id={`exit-price-${entry.id}`}
                            type="number"
                            step="any"
                            value={form.exitPrice}
                            onChange={(e) =>
                              setOpenForms((prev) => ({
                                ...prev,
                                [entry.id]: { ...form, exitPrice: e.target.value },
                              }))
                            }
                            className="mt-1 w-28 rounded-md border border-border bg-bg px-2 py-1 text-xs"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`exit-at-${entry.id}`}
                            className="block text-xs text-muted"
                          >
                            Exit time
                          </label>
                          <input
                            id={`exit-at-${entry.id}`}
                            type="datetime-local"
                            value={form.exitAtIso}
                            onChange={(e) =>
                              setOpenForms((prev) => ({
                                ...prev,
                                [entry.id]: { ...form, exitAtIso: e.target.value },
                              }))
                            }
                            className="mt-1 rounded-md border border-border bg-bg px-2 py-1 text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => submitOutcome(entry.id)}
                          disabled={submitState.phase === 'saving'}
                          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-bg disabled:opacity-50"
                        >
                          {submitState.phase === 'saving' ? 'Saving…' : 'Submit outcome'}
                        </button>
                      </div>
                    )}
                    {submitState.phase === 'error' && (
                      <p className="mt-1 text-xs text-danger" role="alert">
                        {submitState.message}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
