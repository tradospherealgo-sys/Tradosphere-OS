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

  function OpinionIcon({ verdict }: { verdict: string }) {
    const isBullish = verdict === 'bullish' || verdict === 'moderately_bullish';
    const isBearish = verdict === 'bearish' || verdict === 'moderately_bearish';
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={isBullish ? 'text-success' : isBearish ? 'text-danger' : 'text-muted'}
        style={{ transform: isBullish ? 'rotate(0)' : 'rotate(180deg)' }}
      >
        <polyline points="18 15 12 9 6 15" />
      </svg>
    );
  }

  return (
    <section
      className="card-hover rounded-xl border border-border bg-surface p-5"
      aria-labelledby="expert-status-heading"
    >
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
            <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
            <path d="M8 14v2a4 4 0 0 0 8 0v-2" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
        </div>
        <h2 id="expert-status-heading" className="text-sm font-semibold">
          AI Council
        </h2>
      </div>

      {(state === 'loading' || state === 'disconnected' || state === 'awaiting-verdict') && (
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
            {state === 'disconnected'
              ? 'Disconnected from the market feed.'
              : state === 'loading'
                ? 'Connecting to the CIO verdict stream…'
                : 'Awaiting next CIO analysis'}
          </p>
        </div>
      )}

      {(state === 'active' || state === 'stale') && verdict && (
        <div className="mt-4 animate-fade-in grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {verdict.opinions.map((opinion, i) => {
            const isBullish =
              opinion.verdict === 'bullish' || opinion.verdict === 'moderately_bullish';
            const isBearish =
              opinion.verdict === 'bearish' || opinion.verdict === 'moderately_bearish';
            const borderClass = isBullish
              ? 'border-success/20'
              : isBearish
                ? 'border-danger/20'
                : 'border-border';
            return (
              <div
                key={opinion.expert}
                className={`animate-fade-in-up rounded-xl border ${borderClass} bg-bg/50 p-4 transition-all duration-200 hover:shadow-sm`}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {EXPERT_LABEL[opinion.expert]}
                  </p>
                  <OpinionIcon verdict={opinion.verdict} />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`text-sm font-bold ${isBullish ? 'text-success' : isBearish ? 'text-danger' : 'text-text'}`}
                  >
                    {VERDICT_LABEL[opinion.verdict]}
                  </span>
                </div>
                {/* Confidence mini-bar */}
                <div className="mt-2 flex items-center gap-1.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${isBullish ? 'bg-success' : isBearish ? 'bg-danger' : 'bg-muted'}`}
                      style={{ width: `${Math.round(opinion.confidence * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-medium tabular-nums text-muted">
                    {Math.round(opinion.confidence * 100)}%
                  </span>
                </div>
                {opinion.reasoning.length > 0 && (
                  <p className="mt-2 text-xs leading-relaxed text-text/70 line-clamp-2">
                    {opinion.reasoning[0]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
