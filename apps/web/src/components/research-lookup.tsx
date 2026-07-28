'use client';

// Task 10.3: per-symbol fundamentals lookup. This is the ONE research
// discipline the gateway exposes as a genuine read -- GET
// /v1/research/fundamentals/{symbol} returns whatever was most recently
// ingested for that symbol, with no request body. The other four research
// routes (/technical, /options, /sector, /quant) all require the caller to
// already have raw OHLCV bars or an option-chain snapshot, which nothing in
// apps/web has a source for (per Decision D24) -- deliberately not built
// here rather than faked with placeholder bars.
import { useState } from 'react';
import { SdkHttpError } from '@tradosphere/sdk';
import type { FundamentalAnalysisResult } from '@tradosphere/sdk';
import { sdk } from '@/lib/sdk';

type LookupState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'result'; result: FundamentalAnalysisResult }
  | { phase: 'error'; message: string };

export function ResearchLookup() {
  const [symbol, setSymbol] = useState('');
  const [state, setState] = useState<LookupState>({ phase: 'idle' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = symbol.trim();
    if (!trimmed) return;

    setState({ phase: 'loading' });
    try {
      const result = await sdk.research.fundamentals(trimmed);
      setState({ phase: 'result', result });
    } catch (err) {
      const message =
        err instanceof SdkHttpError ? err.message : 'Could not reach the research service.';
      setState({ phase: 'error', message });
    }
  }

  return (
    <section
      className="rounded-lg border border-border bg-surface p-4"
      aria-labelledby="research-heading"
    >
      <h2 id="research-heading" className="text-sm font-medium">
        Fundamentals Lookup
      </h2>
      <p className="mt-1 text-xs text-muted">
        Reads the most recently ingested fundamentals verdict for a symbol via the real research
        service. No live computation happens here.
      </p>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <label htmlFor="research-symbol" className="sr-only">
          Symbol
        </label>
        <input
          id="research-symbol"
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="e.g. RELIANCE"
          className="w-40 rounded-md border border-border bg-bg px-3 py-1.5 text-sm uppercase tracking-wide"
        />
        <button
          type="submit"
          disabled={state.phase === 'loading' || symbol.trim().length === 0}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-50"
        >
          {state.phase === 'loading' ? 'Looking up…' : 'Look up'}
        </button>
      </form>

      <div className="mt-3">
        {state.phase === 'idle' && (
          <p className="text-sm text-muted" role="status">
            Enter a symbol to fetch its fundamentals verdict.
          </p>
        )}

        {state.phase === 'loading' && (
          <p className="text-sm text-muted" role="status">
            Fetching…
          </p>
        )}

        {state.phase === 'error' && (
          <p className="text-sm text-danger" role="alert">
            {state.message}
          </p>
        )}

        {state.phase === 'result' && state.result.status === 'gap' && (
          <p className="text-sm text-muted" role="status">
            No fundamentals have been ingested for this symbol yet ({state.result.detail}).
          </p>
        )}

        {state.phase === 'result' && state.result.status === 'ok' && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">P/E</dt>
              <dd className="tabular-nums">{state.result.peRatio.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Debt/Equity</dt>
              <dd className="tabular-nums">{state.result.debtToEquity.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Revenue YoY</dt>
              <dd className="tabular-nums">{state.result.revenueGrowthYoyPct.toFixed(1)}%</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Net Margin</dt>
              <dd className="tabular-nums">{state.result.netProfitMarginPct.toFixed(1)}%</dd>
            </div>
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-xs text-muted">Verdict</dt>
              <dd className="font-semibold capitalize">{state.result.verdict}</dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}
