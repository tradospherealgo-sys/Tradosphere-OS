'use client';

// Task 10.3: a feed of trade ideas, built by flattening every real
// CioVerdict this page's connection has actually observed (useMarketStream's
// verdictHistory) -- never a separate "list trade ideas" fetch, because no
// such read endpoint exists (tradeIdeas only ever arrives embedded in a
// cio.verdict message). Same accumulate-only-what-arrived discipline as
// MarketBar's ticksBySymbol.
import type { CioVerdict } from '@tradosphere/sdk';

export interface TradeIdeasFeedProps {
  verdictHistory: CioVerdict[];
}

export function TradeIdeasFeed({ verdictHistory }: TradeIdeasFeedProps) {
  const ideas = verdictHistory.flatMap((v) =>
    v.tradeIdeas.map((idea) => ({ idea, generatedAtIso: v.generatedAtIso })),
  );

  return (
    <section
      className="rounded-lg border border-border bg-surface p-4"
      aria-labelledby="trade-ideas-heading"
    >
      <h2 id="trade-ideas-heading" className="text-sm font-medium">
        Trade Ideas Feed
      </h2>

      {ideas.length === 0 ? (
        <p className="mt-3 text-sm text-muted" role="status">
          No trade ideas observed yet this session. They&apos;ll appear here as real CIO verdicts
          arrive.
        </p>
      ) : (
        <ul className="mt-3 space-y-2" role="list">
          {ideas.map(({ idea, generatedAtIso }, i) => (
            <li
              key={`${idea.symbol}-${idea.direction}-${generatedAtIso}-${i}`}
              className="rounded-md border border-border p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {idea.symbol} · {idea.direction}
                </span>
                <span className="text-xs text-muted">
                  {new Date(generatedAtIso).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                entry {idea.entry} · stop {idea.stopLoss} · target {idea.target} · R:R{' '}
                {idea.riskRewardRatio.toFixed(2)}
              </p>
              {idea.educationNote && <p className="mt-1 text-xs text-text">{idea.educationNote}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
