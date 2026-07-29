'use client';

// Task 10.2: renders every symbol observed live via /stream's market.tick
// messages so far. Deliberately does NOT hardcode a symbol list (e.g.
// RELIANCE/TCS/INFY) -- there is no REST route enumerating which symbols
// services/market-data is actually tracking right now, and guessing would be
// exactly the kind of fabricated-looking data Vega charter rule 1
// forbids. The bar starts empty and grows as real ticks arrive.
import type { MarketTick } from '@tradosphere/sdk';
import type { MarketStreamStatus } from '@/lib/market-stream';
import { ConnectionBadge } from './connection-badge';

function formatAge(timestampIso: string, nowMs: number): string {
  const ms = nowMs - new Date(timestampIso).getTime();
  if (ms < 0) return 'just now';
  if (ms < 1000) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  return `${Math.floor(ms / 60_000)}m ago`;
}

export interface MarketBarProps {
  status: MarketStreamStatus;
  ticksBySymbol: Record<string, MarketTick>;
  /** Injectable for deterministic tests; defaults to the real clock. */
  now?: number;
}

export function MarketBar({ status, ticksBySymbol, now = Date.now() }: MarketBarProps) {
  const ticks = Object.values(ticksBySymbol).sort((a, b) => a.symbol.localeCompare(b.symbol));

  return (
    <section
      className="card-hover rounded-xl border border-border bg-surface p-5"
      aria-labelledby="market-bar-heading"
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
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <h2 id="market-bar-heading" className="text-sm font-semibold">
            Live Market
          </h2>
        </div>
        <ConnectionBadge status={status} />
      </div>

      {ticks.length === 0 ? (
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
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <p className="text-sm text-muted" role="status">
            {status === 'open'
              ? 'Connected — waiting for the first tick.'
              : status === 'disconnected'
                ? 'Disconnected from the market feed.'
                : 'Connecting to the market feed…'}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ticks.map((tick, i) => (
            <div
              key={tick.symbol}
              className="animate-fade-in-up rounded-xl border border-border bg-bg/50 p-4 transition-all duration-200 hover:border-accent/30 hover:shadow-sm"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {tick.symbol}
                </p>
                <span className="flex h-5 items-center rounded-full bg-accent/10 px-1.5 text-[10px] font-medium text-accent">
                  NSE
                </span>
              </div>
              <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight">
                {tick.price.toFixed(2)}
              </p>
              <div className="mt-2 flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1">
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
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  Vol {tick.volume.toLocaleString()}
                </span>
                <span>{formatAge(tick.timestampIso, now)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
