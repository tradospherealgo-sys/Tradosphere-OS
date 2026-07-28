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
      className="rounded-lg border border-border bg-surface p-4"
      aria-labelledby="market-bar-heading"
    >
      <div className="flex items-center justify-between">
        <h2 id="market-bar-heading" className="text-sm font-medium">
          Live Market
        </h2>
        <ConnectionBadge status={status} />
      </div>

      {ticks.length === 0 ? (
        <p className="mt-3 text-sm text-muted" role="status">
          {status === 'open'
            ? 'Connected to the market feed — waiting for the first tick.'
            : status === 'disconnected'
              ? 'Disconnected from the market feed.'
              : 'Connecting to the market feed…'}
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-3" role="list">
          {ticks.map((tick) => (
            <li
              key={tick.symbol}
              className="min-w-[8rem] rounded-md border border-border px-3 py-2"
            >
              <p className="text-xs text-muted">{tick.symbol}</p>
              <p className="text-base font-semibold tabular-nums">{tick.price.toFixed(2)}</p>
              <p className="text-xs text-muted">
                vol {tick.volume.toLocaleString()} · {formatAge(tick.timestampIso, now)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
