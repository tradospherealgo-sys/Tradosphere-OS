'use client';

// Task 10.2: renders the AI Council's per-expert opinions carried on the
// same cio.verdict message CioVerdictPanel consumes -- there is no separate
// "expert status" endpoint (see market-stream.ts's header comment), so this
// component is purely a view over verdict.opinions and shares the panel's
// state derivation rather than inventing its own notion of "no data yet".
import type { CioVerdict } from '@tradosphere/sdk';
import type { MarketStreamStatus } from '@/lib/market-stream';
import { deriveVerdictPanelState } from '@/lib/verdict-panel-state';
import { EXPERT_LABEL, VERDICT_LABEL } from '@/lib/expert-labels';

export interface ExpertStatusRowProps {
  status: MarketStreamStatus;
  verdict: CioVerdict | null;
  verdictReceivedAt: number | null;
  /** Injectable for deterministic tests; defaults to the real clock. */
  now?: number;
}

export function ExpertStatusRow({
  status,
  verdict,
  verdictReceivedAt,
  now = Date.now(),
}: ExpertStatusRowProps) {
  const state = deriveVerdictPanelState(status, verdict, verdictReceivedAt, now);

  return (
    <section
      className="rounded-lg border border-border bg-surface p-4"
      aria-labelledby="expert-status-heading"
    >
      <h2 id="expert-status-heading" className="text-sm font-medium">
        AI Council
      </h2>

      {(state === 'loading' || state === 'disconnected' || state === 'awaiting-verdict') && (
        <p className="mt-3 text-sm text-muted" role="status">
          {state === 'disconnected'
            ? 'Disconnected from the market feed.'
            : state === 'loading'
              ? 'Connecting to the CIO verdict stream…'
              : 'Awaiting next CIO analysis'}
        </p>
      )}

      {(state === 'active' || state === 'stale') && verdict && (
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3" role="list">
          {verdict.opinions.map((opinion) => (
            <li key={opinion.expert} className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted">{EXPERT_LABEL[opinion.expert]}</p>
              <p className="text-sm font-semibold">{VERDICT_LABEL[opinion.verdict]}</p>
              <p className="text-xs text-muted tabular-nums">
                {Math.round(opinion.confidence * 100)}% confidence
              </p>
              {opinion.reasoning.length > 0 && (
                <p className="mt-1 text-xs text-text">{opinion.reasoning[0]}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
