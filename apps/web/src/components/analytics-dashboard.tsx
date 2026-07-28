'use client';

// Task 10.4: analytics -- real reads only. performance() already returns a
// FullStatSet (totalTrades/winRate/averageReturn/expectancy/drawdown/
// sharpe/sortino etc. in one response), a superset of the six single-metric
// endpoints (winRate, averageReturn, riskReward, expectancy, drawdown,
// riskAdjustedReturns), so those six are never called here -- calling them
// too would just repeat numbers performance() already carries over the same
// underlying trade set. strategyStats(), tradeDistribution(), heatmap(),
// sessionAnalysis(), instrumentAnalysis(), and monthlyReports() each return
// a genuinely distinct breakdown and are fetched independently so one
// section failing never blanks the others.
import { useEffect, useState } from 'react';
import { SdkHttpError } from '@tradosphere/sdk';
import type {
  FullStatSet,
  HeatmapCell,
  InstrumentStats,
  MonthlyReport,
  SessionStats,
  StrategyStats,
  TradeDistribution,
} from '@tradosphere/sdk';
import { sdk } from '@/lib/sdk';
import { FreshnessNote } from './freshness-note';

type SectionState<T> =
  | { phase: 'loading' }
  | { phase: 'loaded'; data: T; fetchedAtMs: number }
  | { phase: 'error'; message: string };

function errorMessage(err: unknown): string {
  return err instanceof SdkHttpError ? err.message : 'Could not reach the analytics service.';
}

function pct(value?: number): string {
  return value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
}

function num(value?: number): string {
  return value === undefined ? '—' : value.toFixed(2);
}

export function AnalyticsDashboard() {
  const [performance, setPerformance] = useState<SectionState<FullStatSet>>({ phase: 'loading' });
  const [strategies, setStrategies] = useState<SectionState<StrategyStats[]>>({ phase: 'loading' });
  const [distribution, setDistribution] = useState<SectionState<TradeDistribution>>({
    phase: 'loading',
  });
  const [heatmap, setHeatmap] = useState<SectionState<HeatmapCell[]>>({ phase: 'loading' });
  const [sessions, setSessions] = useState<SectionState<SessionStats[]>>({ phase: 'loading' });
  const [instruments, setInstruments] = useState<SectionState<InstrumentStats[]>>({
    phase: 'loading',
  });
  const [monthly, setMonthly] = useState<SectionState<MonthlyReport[]>>({ phase: 'loading' });

  useEffect(() => {
    sdk.analytics
      .performance()
      .then((data) => setPerformance({ phase: 'loaded', data, fetchedAtMs: Date.now() }))
      .catch((err) => setPerformance({ phase: 'error', message: errorMessage(err) }));

    sdk.analytics
      .strategyStats()
      .then(({ strategies: data }) =>
        setStrategies({ phase: 'loaded', data, fetchedAtMs: Date.now() }),
      )
      .catch((err) => setStrategies({ phase: 'error', message: errorMessage(err) }));

    sdk.analytics
      .tradeDistribution()
      .then((data) => setDistribution({ phase: 'loaded', data, fetchedAtMs: Date.now() }))
      .catch((err) => setDistribution({ phase: 'error', message: errorMessage(err) }));

    sdk.analytics
      .heatmap()
      .then(({ cells }) => setHeatmap({ phase: 'loaded', data: cells, fetchedAtMs: Date.now() }))
      .catch((err) => setHeatmap({ phase: 'error', message: errorMessage(err) }));

    sdk.analytics
      .sessionAnalysis()
      .then(({ sessions: data }) => setSessions({ phase: 'loaded', data, fetchedAtMs: Date.now() }))
      .catch((err) => setSessions({ phase: 'error', message: errorMessage(err) }));

    sdk.analytics
      .instrumentAnalysis()
      .then(({ instruments: data }) =>
        setInstruments({ phase: 'loaded', data, fetchedAtMs: Date.now() }),
      )
      .catch((err) => setInstruments({ phase: 'error', message: errorMessage(err) }));

    sdk.analytics
      .monthlyReports()
      .then(({ reports }) =>
        setMonthly({ phase: 'loaded', data: reports, fetchedAtMs: Date.now() }),
      )
      .catch((err) => setMonthly({ phase: 'error', message: errorMessage(err) }));
  }, []);

  return (
    <div className="space-y-4">
      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="analytics-performance-heading"
      >
        <div className="flex items-center justify-between">
          <h2 id="analytics-performance-heading" className="text-sm font-medium">
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
          <>
            {performance.data.totalTrades === 0 ? (
              <p className="mt-3 text-sm text-muted" role="status">
                No trades recorded yet -- stats will appear once the journal has closed trades.
              </p>
            ) : (
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">Total trades</dt>
                  <dd className="text-sm font-medium">{performance.data.totalTrades}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Win / loss / breakeven / open</dt>
                  <dd className="text-sm font-medium">
                    {performance.data.winningTrades} / {performance.data.losingTrades} /{' '}
                    {performance.data.breakevenTrades} / {performance.data.openTrades}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Win rate</dt>
                  <dd className="text-sm font-medium">{pct(performance.data.winRate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Total realized P&L</dt>
                  <dd className="text-sm font-medium">{num(performance.data.totalRealizedPnl)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Avg return / avg return %</dt>
                  <dd className="text-sm font-medium">
                    {num(performance.data.averageReturn)} / {pct(performance.data.averageReturnPct)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Expectancy</dt>
                  <dd className="text-sm font-medium">{num(performance.data.expectancy)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Planned / realized R:R</dt>
                  <dd className="text-sm font-medium">
                    {num(performance.data.plannedRiskRewardRatio)} /{' '}
                    {num(performance.data.realizedRiskRewardRatio)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Max drawdown</dt>
                  <dd className="text-sm font-medium">{pct(performance.data.maxDrawdownPct)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Sharpe / Sortino</dt>
                  <dd className="text-sm font-medium">
                    {num(performance.data.sharpeRatio)} / {num(performance.data.sortinoRatio)}
                  </dd>
                </div>
              </dl>
            )}
          </>
        )}
      </section>

      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="analytics-strategy-heading"
      >
        <div className="flex items-center justify-between">
          <h2 id="analytics-strategy-heading" className="text-sm font-medium">
            By strategy
          </h2>
          {strategies.phase === 'loaded' && <FreshnessNote atMs={strategies.fetchedAtMs} />}
        </div>

        {strategies.phase === 'loading' && (
          <p className="mt-3 text-sm text-muted" role="status">
            Loading…
          </p>
        )}
        {strategies.phase === 'error' && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {strategies.message}
          </p>
        )}
        {strategies.phase === 'loaded' &&
          (strategies.data.length === 0 ? (
            <p className="mt-3 text-sm text-muted" role="status">
              No strategy breakdown yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-1" role="list">
              {strategies.data.map((s) => (
                <li
                  key={s.strategy.key}
                  className="rounded-md border border-border px-3 py-1.5 text-sm"
                >
                  <span className="font-medium">
                    {s.strategy.cioVerdictLabel ?? s.strategy.key}
                    {s.strategy.recommendedDirection ? ` · ${s.strategy.recommendedDirection}` : ''}
                  </span>
                  <span className="ml-2 text-xs text-muted">
                    {s.totalTrades} trades · win rate {pct(s.winRate)} · P&L{' '}
                    {num(s.totalRealizedPnl)}
                  </span>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="analytics-instruments-heading"
      >
        <div className="flex items-center justify-between">
          <h2 id="analytics-instruments-heading" className="text-sm font-medium">
            By instrument
          </h2>
          {instruments.phase === 'loaded' && <FreshnessNote atMs={instruments.fetchedAtMs} />}
        </div>

        {instruments.phase === 'loading' && (
          <p className="mt-3 text-sm text-muted" role="status">
            Loading…
          </p>
        )}
        {instruments.phase === 'error' && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {instruments.message}
          </p>
        )}
        {instruments.phase === 'loaded' &&
          (instruments.data.length === 0 ? (
            <p className="mt-3 text-sm text-muted" role="status">
              No instrument breakdown yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-1" role="list">
              {instruments.data.map((i) => (
                <li key={i.symbol} className="rounded-md border border-border px-3 py-1.5 text-sm">
                  <span className="font-medium">{i.symbol}</span>
                  <span className="ml-2 text-xs text-muted">
                    {i.totalTrades} trades · win rate {pct(i.winRate)} · P&L{' '}
                    {num(i.totalRealizedPnl)}
                  </span>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="analytics-sessions-heading"
      >
        <div className="flex items-center justify-between">
          <h2 id="analytics-sessions-heading" className="text-sm font-medium">
            By session
          </h2>
          {sessions.phase === 'loaded' && <FreshnessNote atMs={sessions.fetchedAtMs} />}
        </div>

        {sessions.phase === 'loading' && (
          <p className="mt-3 text-sm text-muted" role="status">
            Loading…
          </p>
        )}
        {sessions.phase === 'error' && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {sessions.message}
          </p>
        )}
        {sessions.phase === 'loaded' &&
          (sessions.data.length === 0 ? (
            <p className="mt-3 text-sm text-muted" role="status">
              No session breakdown yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-1" role="list">
              {sessions.data.map((s) => (
                <li key={s.session} className="rounded-md border border-border px-3 py-1.5 text-sm">
                  <span className="font-medium">{s.label}</span>
                  <span className="ml-2 text-xs text-muted">
                    {s.totalTrades} trades · win rate {pct(s.winRate)} · P&L{' '}
                    {num(s.totalRealizedPnl)}
                  </span>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="analytics-heatmap-heading"
      >
        <div className="flex items-center justify-between">
          <h2 id="analytics-heatmap-heading" className="text-sm font-medium">
            Day / session heatmap
          </h2>
          {heatmap.phase === 'loaded' && <FreshnessNote atMs={heatmap.fetchedAtMs} />}
        </div>

        {heatmap.phase === 'loading' && (
          <p className="mt-3 text-sm text-muted" role="status">
            Loading…
          </p>
        )}
        {heatmap.phase === 'error' && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {heatmap.message}
          </p>
        )}
        {heatmap.phase === 'loaded' && (
          <ul className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-4" role="list">
            {heatmap.data.map((cell) => (
              <li
                key={`${cell.dayOfWeek}-${cell.session}`}
                className="rounded-md border border-border px-2 py-1 text-xs"
              >
                <span className="font-medium">
                  {cell.dayOfWeek} · {cell.sessionLabel}
                </span>
                <br />
                <span className="text-muted">
                  {cell.totalTrades} trades · P&L {num(cell.totalRealizedPnl)}
                  {cell.winRate !== undefined ? ` · win rate ${pct(cell.winRate)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="analytics-distribution-heading"
      >
        <div className="flex items-center justify-between">
          <h2 id="analytics-distribution-heading" className="text-sm font-medium">
            Trade P&L distribution
          </h2>
          {distribution.phase === 'loaded' && <FreshnessNote atMs={distribution.fetchedAtMs} />}
        </div>

        {distribution.phase === 'loading' && (
          <p className="mt-3 text-sm text-muted" role="status">
            Loading…
          </p>
        )}
        {distribution.phase === 'error' && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {distribution.message}
          </p>
        )}
        {distribution.phase === 'loaded' &&
          (distribution.data.buckets.length === 0 ? (
            <p className="mt-3 text-sm text-muted" role="status">
              No distribution to show yet.
            </p>
          ) : (
            <>
              <ul className="mt-3 space-y-1" role="list">
                {distribution.data.buckets.map((bucket) => (
                  <li
                    key={`${bucket.rangeStart}-${bucket.rangeEnd}`}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm"
                  >
                    <span>
                      {bucket.rangeStart.toFixed(2)} to {bucket.rangeEnd.toFixed(2)}
                    </span>
                    <span className="text-xs text-muted">{bucket.count} trades</span>
                  </li>
                ))}
              </ul>
              {(distribution.data.minPnl !== undefined ||
                distribution.data.maxPnl !== undefined) && (
                <p className="mt-2 text-xs text-muted">
                  Range {num(distribution.data.minPnl)} to {num(distribution.data.maxPnl)}
                </p>
              )}
            </>
          ))}
      </section>

      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="analytics-monthly-heading"
      >
        <div className="flex items-center justify-between">
          <h2 id="analytics-monthly-heading" className="text-sm font-medium">
            Monthly reports
          </h2>
          {monthly.phase === 'loaded' && <FreshnessNote atMs={monthly.fetchedAtMs} />}
        </div>

        {monthly.phase === 'loading' && (
          <p className="mt-3 text-sm text-muted" role="status">
            Loading…
          </p>
        )}
        {monthly.phase === 'error' && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {monthly.message}
          </p>
        )}
        {monthly.phase === 'loaded' &&
          (monthly.data.length === 0 ? (
            <p className="mt-3 text-sm text-muted" role="status">
              No monthly reports yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-1" role="list">
              {monthly.data.map((report) => (
                <li
                  key={report.month.key}
                  className="rounded-md border border-border px-3 py-1.5 text-sm"
                >
                  <span className="font-medium">{report.month.key}</span>
                  <span className="ml-2 text-xs text-muted">
                    {report.totalTrades} trades · win rate {pct(report.winRate)} · P&L{' '}
                    {num(report.totalRealizedPnl)}
                  </span>
                </li>
              ))}
            </ul>
          ))}
      </section>
    </div>
  );
}
