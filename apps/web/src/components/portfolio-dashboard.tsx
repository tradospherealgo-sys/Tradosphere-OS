'use client';

// Task 10.4: portfolio -- real reads only, four independent SDK calls each
// with its own loading/error state so one failing section never blanks the
// others. summary() already returns cashBalance/positionsValue/realizedPnl/
// unrealizedPnl/totalEquity/positions in one response, a superset of the
// separate positions()/cash()/pnl() endpoints, so those three are not called
// here to avoid three redundant network round trips for numbers summary()
// already carries. performance() (startingCash/totalReturn/totalReturnPct),
// allocation() (per-position allocation %), and risk() (exposure/leverage)
// each return genuinely distinct figures, so all three are still fetched
// separately alongside summary(). Any symbol missing a live price is listed
// via missingPriceSymbols rather than silently priced at zero or omitted.
import { useEffect, useState } from 'react';
import { SdkHttpError } from '@tradosphere/sdk';
import type {
  PortfolioAllocationResponse,
  PortfolioRiskResponse,
  PortfolioSummaryResponse,
  PerformanceMetrics,
} from '@tradosphere/sdk';
import { sdk } from '@/lib/sdk';
import { FreshnessNote } from './freshness-note';

type SectionState<T> =
  | { phase: 'loading' }
  | { phase: 'loaded'; data: T; fetchedAtMs: number }
  | { phase: 'error'; message: string };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof SdkHttpError ? err.message : fallback;
}

function MissingPrices({ symbols }: { symbols: string[] }) {
  if (symbols.length === 0) return null;
  return (
    <p className="mt-2 text-xs text-danger" role="alert">
      No live price on record for: {symbols.join(', ')}. Figures above exclude these symbols rather
      than guessing a price.
    </p>
  );
}

export function PortfolioDashboard() {
  const [summary, setSummary] = useState<SectionState<PortfolioSummaryResponse>>({
    phase: 'loading',
  });
  const [performance, setPerformance] = useState<SectionState<PerformanceMetrics>>({
    phase: 'loading',
  });
  const [allocation, setAllocation] = useState<SectionState<PortfolioAllocationResponse>>({
    phase: 'loading',
  });
  const [risk, setRisk] = useState<SectionState<PortfolioRiskResponse>>({ phase: 'loading' });

  async function load() {
    setSummary({ phase: 'loading' });
    setPerformance({ phase: 'loading' });
    setAllocation({ phase: 'loading' });
    setRisk({ phase: 'loading' });

    sdk.portfolio
      .summary()
      .then((data) => setSummary({ phase: 'loaded', data, fetchedAtMs: Date.now() }))
      .catch((err) =>
        setSummary({
          phase: 'error',
          message: errorMessage(err, 'Could not reach the portfolio service.'),
        }),
      );

    sdk.portfolio
      .performance()
      .then((data) => setPerformance({ phase: 'loaded', data, fetchedAtMs: Date.now() }))
      .catch((err) =>
        setPerformance({
          phase: 'error',
          message: errorMessage(err, 'Could not reach the portfolio service.'),
        }),
      );

    sdk.portfolio
      .allocation()
      .then((data) => setAllocation({ phase: 'loaded', data, fetchedAtMs: Date.now() }))
      .catch((err) =>
        setAllocation({
          phase: 'error',
          message: errorMessage(err, 'Could not reach the portfolio service.'),
        }),
      );

    sdk.portfolio
      .risk()
      .then((data) => setRisk({ phase: 'loaded', data, fetchedAtMs: Date.now() }))
      .catch((err) =>
        setRisk({
          phase: 'error',
          message: errorMessage(err, 'Could not reach the portfolio service.'),
        }),
      );
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="portfolio-summary-heading"
      >
        <div className="flex items-center justify-between">
          <h2 id="portfolio-summary-heading" className="text-sm font-medium">
            Summary
          </h2>
          {summary.phase === 'loaded' && <FreshnessNote atMs={summary.fetchedAtMs} />}
        </div>

        {summary.phase === 'loading' && (
          <p className="mt-3 text-sm text-muted" role="status">
            Loading…
          </p>
        )}
        {summary.phase === 'error' && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {summary.message}
          </p>
        )}
        {summary.phase === 'loaded' && (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">Total equity</dt>
                <dd className="text-lg font-semibold">{summary.data.totalEquity.toFixed(2)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Cash balance</dt>
                <dd className="text-sm font-medium">{summary.data.cashBalance.toFixed(2)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Positions value</dt>
                <dd className="text-sm font-medium">{summary.data.positionsValue.toFixed(2)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Realized P&L</dt>
                <dd className="text-sm font-medium">{summary.data.realizedPnl.toFixed(2)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Unrealized P&L</dt>
                <dd className="text-sm font-medium">{summary.data.unrealizedPnl.toFixed(2)}</dd>
              </div>
            </dl>
            <MissingPrices symbols={summary.data.missingPriceSymbols} />

            <h3 className="mt-4 text-xs font-medium text-muted">Positions</h3>
            {summary.data.positions.length === 0 ? (
              <p className="mt-1 text-sm text-muted" role="status">
                No open positions.
              </p>
            ) : (
              <ul className="mt-2 space-y-1" role="list">
                {summary.data.positions.map((position) => (
                  <li
                    key={`${position.symbol}-${position.direction}`}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm"
                  >
                    <span>
                      {position.symbol} · {position.direction} · qty {position.quantity}
                    </span>
                    <span className="text-xs text-muted">
                      avg entry {position.averageEntryPrice.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="portfolio-performance-heading"
      >
        <div className="flex items-center justify-between">
          <h2 id="portfolio-performance-heading" className="text-sm font-medium">
            Performance
          </h2>
          {performance.phase === 'loaded' && <FreshnessNote atMs={performance.fetchedAtMs} />}
        </div>

        {performance.phase === 'loading' && (
          <p className="mt-3 text-sm text-muted" role="status">
            Loading…
          </p>
        )}
        {performance.phase === 'error' && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {performance.message}
          </p>
        )}
        {performance.phase === 'loaded' && (
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Starting cash</dt>
              <dd className="text-sm font-medium">{performance.data.startingCash.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Total return</dt>
              <dd className="text-sm font-medium">
                {performance.data.totalReturn.toFixed(2)} (
                {performance.data.totalReturnPct.toFixed(2)}%)
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="portfolio-allocation-heading"
      >
        <div className="flex items-center justify-between">
          <h2 id="portfolio-allocation-heading" className="text-sm font-medium">
            Allocation
          </h2>
          {allocation.phase === 'loaded' && <FreshnessNote atMs={allocation.fetchedAtMs} />}
        </div>

        {allocation.phase === 'loading' && (
          <p className="mt-3 text-sm text-muted" role="status">
            Loading…
          </p>
        )}
        {allocation.phase === 'error' && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {allocation.message}
          </p>
        )}
        {allocation.phase === 'loaded' && (
          <>
            {allocation.data.allocation.length === 0 ? (
              <p className="mt-3 text-sm text-muted" role="status">
                No allocation to show yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-1" role="list">
                {allocation.data.allocation.map((entry) => (
                  <li
                    key={`${entry.symbol}-${entry.direction}`}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm"
                  >
                    <span>
                      {entry.symbol} · {entry.direction}
                    </span>
                    <span className="text-xs text-muted">
                      {entry.marketValue.toFixed(2)} · {entry.allocationPct.toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <MissingPrices symbols={allocation.data.missingPriceSymbols} />
          </>
        )}
      </section>

      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="portfolio-risk-heading"
      >
        <div className="flex items-center justify-between">
          <h2 id="portfolio-risk-heading" className="text-sm font-medium">
            Risk
          </h2>
          {risk.phase === 'loaded' && <FreshnessNote atMs={risk.fetchedAtMs} />}
        </div>

        {risk.phase === 'loading' && (
          <p className="mt-3 text-sm text-muted" role="status">
            Loading…
          </p>
        )}
        {risk.phase === 'error' && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {risk.message}
          </p>
        )}
        {risk.phase === 'loaded' && (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Gross exposure</dt>
                <dd className="text-sm font-medium">{risk.data.grossExposure.toFixed(2)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Net exposure</dt>
                <dd className="text-sm font-medium">{risk.data.netExposure.toFixed(2)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Leverage</dt>
                <dd className="text-sm font-medium">{risk.data.leverageRatio.toFixed(2)}x</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Largest position</dt>
                <dd className="text-sm font-medium">{risk.data.largestPositionPct.toFixed(1)}%</dd>
              </div>
            </dl>
            <MissingPrices symbols={risk.data.missingPriceSymbols} />
          </>
        )}
      </section>
    </div>
  );
}
