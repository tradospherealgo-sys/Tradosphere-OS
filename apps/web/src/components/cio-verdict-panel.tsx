'use client';

// Task 10.2: renders the CIO verdict exactly as it arrives over /stream --
// never fabricates a verdict, a confidence number, or trade ideas. Per
// Anshh's Sprint 10.2 scope decision (EXECUTION_BOOK.md Decision D23), this
// sprint adds no backend orchestration or synchronous verdict endpoint; the
// panel is purely an observer of cio.verdict messages the gateway relays,
// and is explicit about which of the 5 states it's currently in rather than
// ever guessing (Vega charter rule 1).
import type { CioVerdict } from '@tradosphere/sdk';
import type { MarketStreamStatus } from '@/lib/market-stream';
import { deriveVerdictPanelState } from '@/lib/verdict-panel-state';
import { VERDICT_LABEL } from '@/lib/expert-labels';
import { ConnectionBadge } from './connection-badge';

const VERDICT_DOT_CLASS: Record<CioVerdict['verdict'], string> = {
  bullish: 'bg-success',
  moderately_bullish: 'bg-success',
  neutral: 'bg-muted',
  moderately_bearish: 'bg-danger',
  bearish: 'bg-danger',
};

function formatAge(ms: number): string {
  if (ms < 0) return 'just now';
  if (ms < 1000) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

export interface CioVerdictPanelProps {
  status: MarketStreamStatus;
  verdict: CioVerdict | null;
  verdictReceivedAt: number | null;
  /** Injectable for deterministic tests; defaults to the real clock. */
  now?: number;
}

export function CioVerdictPanel({
  status,
  verdict,
  verdictReceivedAt,
  now = Date.now(),
}: CioVerdictPanelProps) {
  const state = deriveVerdictPanelState(status, verdict, verdictReceivedAt, now);

  return (
    <section
      className="rounded-lg border border-border bg-surface p-4"
      aria-labelledby="cio-verdict-heading"
    >
      <div className="flex items-center justify-between">
        <h2 id="cio-verdict-heading" className="text-sm font-medium">
          CIO Verdict
        </h2>
        <ConnectionBadge status={status} />
      </div>

      {state === 'loading' && (
        <p className="mt-3 text-sm text-muted" role="status">
          Connecting to the CIO verdict stream…
        </p>
      )}

      {state === 'disconnected' && (
        <p className="mt-3 text-sm text-muted" role="status">
          Disconnected from the market feed. No verdict available.
        </p>
      )}

      {state === 'awaiting-verdict' && (
        <p className="mt-3 text-sm text-muted" role="status">
          Awaiting next CIO analysis
        </p>
      )}

      {(state === 'active' || state === 'stale') && verdict && verdictReceivedAt !== null && (
        <div className="mt-3 space-y-2">
          {state === 'stale' && (
            <p
              className="rounded-md bg-danger/10 px-2 py-1 text-xs font-medium text-danger"
              role="status"
            >
              STALE — this verdict is no longer current
            </p>
          )}
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${VERDICT_DOT_CLASS[verdict.verdict]}`}
              aria-hidden="true"
            />
            <span className="text-lg font-semibold">{VERDICT_LABEL[verdict.verdict]}</span>
            <span className="text-sm text-muted tabular-nums">
              {Math.round(verdict.confidence * 100)}% confidence
            </span>
          </div>
          <p className="text-xs text-muted">
            Received {formatAge(now - verdictReceivedAt)} · generated{' '}
            {new Date(verdict.generatedAtIso).toLocaleTimeString()}
          </p>
          {verdict.tradeIdeas.length > 0 && (
            <ul className="mt-2 space-y-1" role="list">
              {verdict.tradeIdeas.map((idea) => (
                <li key={`${idea.symbol}-${idea.direction}`} className="text-xs text-text">
                  <span className="font-medium">{idea.symbol}</span> {idea.direction} · entry{' '}
                  {idea.entry} · stop {idea.stopLoss} · target {idea.target} (R:R{' '}
                  {idea.riskRewardRatio.toFixed(2)})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
