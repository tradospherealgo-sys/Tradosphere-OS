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

  function VerdictIcon({ verdict }: { verdict: CioVerdict['verdict'] }) {
    const isBullish = verdict === 'bullish' || verdict === 'moderately_bullish';
    const isBearish = verdict === 'bearish' || verdict === 'moderately_bearish';
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={isBullish ? 'text-success' : isBearish ? 'text-danger' : 'text-muted'}
        style={{ transform: isBullish ? 'rotate(0deg)' : 'rotate(180deg)' }}
      >
        <polyline points="18 15 12 9 6 15" />
      </svg>
    );
  }

  return (
    <section
      className="card-hover rounded-xl border border-border bg-surface p-5"
      aria-labelledby="cio-verdict-heading"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent"
            >
              <path d="M12 20V10" />
              <path d="M18 20V4" />
              <path d="M6 20v-4" />
            </svg>
          </div>
          <h2 id="cio-verdict-heading" className="text-sm font-semibold">
            CIO Verdict
          </h2>
        </div>
        <ConnectionBadge status={status} />
      </div>

      {state === 'loading' && (
        <div className="mt-5 flex flex-col items-center gap-2 py-6 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          <p className="text-sm text-muted" role="status">
            Connecting…
          </p>
        </div>
      )}

      {state === 'disconnected' && (
        <div className="mt-5 flex flex-col items-center gap-2 py-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-danger"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <p className="text-sm text-muted" role="status">
            Disconnected. No verdict available.
          </p>
        </div>
      )}

      {state === 'awaiting-verdict' && (
        <div className="mt-5 flex flex-col items-center gap-2 py-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <p className="text-sm text-muted" role="status">
            Awaiting next CIO analysis
          </p>
        </div>
      )}

      {(state === 'active' || state === 'stale') && verdict && verdictReceivedAt !== null && (
        <div className="mt-4 animate-fade-in space-y-4">
          {state === 'stale' && (
            <div
              className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger"
              role="status"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              STALE — this verdict is no longer current
            </div>
          )}

          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${VERDICT_DOT_CLASS[verdict.verdict]} bg-opacity-10`}
            >
              <VerdictIcon verdict={verdict.verdict} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold">{VERDICT_LABEL[verdict.verdict]}</span>
              </div>
              {/* Confidence bar */}
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${verdict.verdict === 'bearish' || verdict.verdict === 'moderately_bearish' ? 'bg-danger' : verdict.verdict === 'neutral' ? 'bg-muted' : 'bg-success'}`}
                    style={{ width: `${Math.round(verdict.confidence * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums text-muted">
                  {Math.round(verdict.confidence * 100)}%
                </span>
              </div>
            </div>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Received {formatAge(now - verdictReceivedAt)} ·{' '}
            {new Date(verdict.generatedAtIso).toLocaleTimeString()}
          </p>

          {verdict.tradeIdeas.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Trade Ideas
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {verdict.tradeIdeas.map((idea) => {
                  const isLong = idea.direction === 'long';
                  return (
                    <div
                      key={`${idea.symbol}-${idea.direction}`}
                      className="rounded-lg border border-border bg-bg/50 p-3 transition-all hover:border-accent/30"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold">{idea.symbol}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${isLong ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}
                        >
                          {idea.direction}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted">
                        <span>Entry: {idea.entry}</span>
                        <span>Stop: {idea.stopLoss}</span>
                        <span>Target: {idea.target}</span>
                        <span>R:R: {idea.riskRewardRatio.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {verdict.tradeIdeas.length === 0 && (
            <div className="rounded-lg bg-bg/50 p-3 text-center text-xs text-muted">
              No trade ideas in this verdict.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
