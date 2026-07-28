'use client';

// Task 10.3: full per-expert breakdown of the latest real CioVerdict's
// opinions -- the same data expert-status-row.tsx (10.2) summarizes on the
// Dashboard, expanded here into the full reasoning trail per expert. There
// is no per-agent "get current opinion" read endpoint (each /v1/ai/agents/*
// route requires a caller-supplied research result as input, per Decision
// D24), so this view is strictly an observer of whatever verdict has
// actually arrived over /stream -- never a fabricated per-expert call.
import type { CioVerdict } from '@tradosphere/sdk';
import type { MarketStreamStatus } from '@/lib/market-stream';
import { deriveVerdictPanelState } from '@/lib/verdict-panel-state';
import { EXPERT_LABEL, VERDICT_LABEL } from '@/lib/expert-labels';

export interface AiCouncilDetailProps {
  status: MarketStreamStatus;
  verdict: CioVerdict | null;
  verdictReceivedAt: number | null;
  now?: number;
}

export function AiCouncilDetail({
  status,
  verdict,
  verdictReceivedAt,
  now = Date.now(),
}: AiCouncilDetailProps) {
  const state = deriveVerdictPanelState(status, verdict, verdictReceivedAt, now);

  return (
    <section
      className="rounded-lg border border-border bg-surface p-4"
      aria-labelledby="ai-council-heading"
    >
      <h2 id="ai-council-heading" className="text-sm font-medium">
        AI Council — Full Breakdown
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
        <div className="mt-3 space-y-3">
          {state === 'stale' && (
            <p
              className="rounded-md bg-danger/10 px-2 py-1 text-xs font-medium text-danger"
              role="status"
            >
              STALE — this breakdown is from an older verdict, not the current one
            </p>
          )}
          {verdict.opinions.length === 0 ? (
            <p className="text-sm text-muted" role="status">
              The latest verdict carried no per-expert opinions.
            </p>
          ) : (
            verdict.opinions.map((opinion) => (
              <div key={opinion.expert} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{EXPERT_LABEL[opinion.expert]}</span>
                  <span className="text-xs text-muted">
                    {VERDICT_LABEL[opinion.verdict]} · {Math.round(opinion.confidence * 100)}%
                    confidence
                  </span>
                </div>
                {opinion.reasoning.length > 0 ? (
                  <ul
                    className="mt-2 list-inside list-disc space-y-1 text-sm text-text"
                    role="list"
                  >
                    {opinion.reasoning.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted">No reasoning provided.</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
