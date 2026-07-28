'use client';

// Task 10.3: "Explain this verdict" -- calls the real POST
// /v1/education/tutor/explain with the current verdict's real opinions
// array. This is NOT a free-form chat (no such endpoint exists per Decision
// D24); it's a single real call that turns already-observed opinions into
// one plain-language explanation from services/ai's EducationAgent.
import { useState } from 'react';
import { SdkHttpError, type CioVerdict, type ExpertOpinion } from '@tradosphere/sdk';
import { sdk } from '@/lib/sdk';

type ExplainState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'result'; opinion: ExpertOpinion }
  | { phase: 'error'; message: string };

export interface TutorExplainPanelProps {
  verdict: CioVerdict | null;
}

export function TutorExplainPanel({ verdict }: TutorExplainPanelProps) {
  const [state, setState] = useState<ExplainState>({ phase: 'idle' });

  async function handleExplain() {
    if (!verdict || verdict.opinions.length === 0) return;
    setState({ phase: 'loading' });
    try {
      const opinion = await sdk.education.tutorExplain({ opinions: verdict.opinions });
      setState({ phase: 'result', opinion });
    } catch (err) {
      const message =
        err instanceof SdkHttpError ? err.message : 'Could not reach the tutor service.';
      setState({ phase: 'error', message });
    }
  }

  const disabled = !verdict || verdict.opinions.length === 0 || state.phase === 'loading';

  return (
    <section
      className="rounded-lg border border-border bg-surface p-4"
      aria-labelledby="tutor-explain-heading"
    >
      <h2 id="tutor-explain-heading" className="text-sm font-medium">
        Explain This Verdict
      </h2>
      <p className="mt-1 text-xs text-muted">
        Sends the current verdict&apos;s real expert opinions to the AI tutor for a plain-language
        explanation.
      </p>

      <button
        type="button"
        onClick={handleExplain}
        disabled={disabled}
        className="mt-3 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-50"
      >
        {state.phase === 'loading' ? 'Explaining…' : 'Explain this verdict'}
      </button>

      {!verdict && (
        <p className="mt-3 text-sm text-muted" role="status">
          No verdict has arrived yet — nothing to explain.
        </p>
      )}

      {state.phase === 'error' && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}

      {state.phase === 'result' && (
        <div className="mt-3 rounded-md border border-border p-3 text-sm">
          {state.opinion.reasoning.map((line, i) => (
            <p key={i} className="mb-1 last:mb-0">
              {line}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
