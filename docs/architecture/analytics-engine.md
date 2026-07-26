# Analytics Engine (Sprint 8.4)

## Status

`services/analytics` is built and verified. It has no HTTP dependency on
`services/journal` or `services/portfolio` -- it reads their durable output
(`journal_entries`, `portfolio_snapshots`) directly through
`@tradosphere/database`, the same one-directional service-isolation
precedent Decisions D9/D12/D17 established and D18 (EXECUTION_BOOK.md)
extends here. Every stat this service reports -- win rate, drawdown,
Sharpe/Sortino, heatmaps, breakdowns -- is derived fresh on every call from
that data; nothing is cached or pre-aggregated, so there is no separate
"rebuild the analytics" step that can drift from the underlying trades.

Anshh's Sprint 8.4 order expanded SPRINT_BOOK.md's own literal task 8.4 row
("win rate, realized R:R, drawdown") to 17 named deliverables: Win Rate,
Average Return, Risk/Reward, Drawdown, Sharpe Ratio, Sortino Ratio,
Expectancy, Monthly Reports, Strategy Statistics, Trade Distribution,
Heatmaps, Session Analysis, Instrument Analysis, Performance API, Database
Tables, Repository, Tests, Documentation. That expanded scope is what this
service implements in full.

## The two read ports (why live data sources are a plug-in, not a rewrite)

Same reasoning as `services/portfolio`'s `TradeRecordSource`/`PriceSource`
split (D17): two ports carry every number this service reports, so a
future change to how trades or equity are sourced never touches the
business-logic layer.

1. **`JournalEntrySource`** (`src/journal-source.ts`) -- answers "what has
   this user actually traded." The real adapter, `DatabaseJournalSource`,
   reads `journal_entries` (Decision D16's paper-trading journal, the first
   and only point of persistence for a paper fill) filtered to one user.
   Unlike Portfolio's narrower `TradeRecord` projection, `JournalEntryRecord`
   carries every field the stat modules need: the CIO recommendation
   snapshot (`recommendedDirection`, `recommendedRiskRewardRatio`,
   `cioVerdictLabel` -- for Strategy Statistics and Planned Risk/Reward) plus
   the full outcome (`status`, `exitPrice`, `exitAtIso`, `realizedPnl` -- for
   win rate, drawdown, expectancy, Realized R:R). Every field is a direct
   pass-through of `journal_entries`' own column; nothing is re-derived or
   fabricated.
2. **`EquitySnapshotSource`** (`src/equity-source.ts`) -- answers "what has
   this user's total equity done over time." The real adapter,
   `DatabaseEquitySource`, reads `portfolio_snapshots` (D17's table) ordered
   ascending by `asOf`, returning exactly the two fields `drawdown.ts` and
   `risk-adjusted-returns.ts` need to derive consecutive period returns:
   `totalEquity` and `asOfIso`. An empty array (never a fabricated point) is
   returned for a user with no snapshots yet.

Both ports have `test/fakes.ts` in-memory implementations
(`InMemoryJournalEntrySource`, `InMemoryEquitySnapshotSource`) that back
every unit and HTTP-contract test without touching Postgres -- proof that
the business logic genuinely depends only on the interface.

A third port, **`AnalyticsRepository`** (`src/analytics-repository.ts`),
answers "persist and list this user's generated reports" against the new
`analytics_reports` table -- the one thing in this sprint that genuinely
warrants persistence, since a report is a named, point-in-time snapshot of
the full stat set that a user should be able to look back at without
recomputing it. `DrizzleAnalyticsRepository` is its only adapter today;
`getById` filters by `id` AND `userId` in the same query, so a report
belonging to another user is structurally indistinguishable from one that
doesn't exist (never loaded into memory to compare ownership after the
fact). `userId` uses `ON DELETE SET NULL` (same reasoning as
`journal_entries.userId`/`portfolio_snapshots.userId`) so deleting a
trader's account never deletes or blocks deleting their report history.

## Business logic map

Each module does exactly one job and is unit-tested in isolation. All
sixteen together cover the full 17-deliverable list (Performance API is the
REST surface itself, covered below):

- `trade-stats.ts` -- `closedTradesOf()` is the shared filter every other
  module builds on: an entry counts as closed only when `status ===
  'closed'` AND `realizedPnl`/`exitPrice`/`exitAtIso` are all non-null.
  `computeTradeCounts()` (total/winning/losing/breakeven/open),
  `computeWinRate()` (winning / decisive, decisive = winning + losing,
  breakeven excluded), `computeAverageReturn()`/`computeAverageReturnPct()`
  (mean realized P&L across ALL closed trades, breakeven included) all live
  here.
- `risk-reward.ts` -- Planned Risk/Reward is the mean
  `recommendedRiskRewardRatio` across every entry that has one (open or
  closed -- it's a property of the CIO's recommendation at placement time,
  not the outcome). Realized Risk/Reward is average winning trade P&L
  divided by average losing trade |P&L|, computed purely from real closed
  outcomes.
- `expectancy.ts` -- the standard `winRate * avgWin - lossRate * avgLoss`
  formula over the win/loss population only (breakeven excluded). A
  deliberately different number from Average Return: Expectancy answers
  "what do wins and losses alone predict per decisive trade," Average
  Return answers "what did every closed trade actually average."
- `drawdown.ts` -- Max Drawdown %: the largest peak-to-trough decline in
  the real equity curve (`portfolio_snapshots.totalEquity`), as a fraction
  of the running peak at the trough. Requires >= 2 snapshots; NULL below
  that.
- `risk-adjusted-returns.ts` -- Sharpe and Sortino, both derived from
  consecutive equity-curve period returns (never per-trade P&L, which has
  no consistent time interval to make a ratio meaningful). Sharpe = (mean
  period return - risk-free rate) / stddev(all returns); Sortino uses
  downside deviation (stddev of negative returns only) in place of full
  stddev. Risk-free rate defaults to 0 (documented, configurable, never a
  fabricated real rate). `insufficientData` is true when there are fewer
  than 2 period returns at all; either ratio is independently null when its
  own deviation is exactly 0 (mathematically undefined, not a fabricated
  number).
- `monthly-reports.ts` -- one full stat block per UTC calendar month, keyed
  by each entry's own `filledAtIso` (a trade filled in January and closed in
  February is entirely a January trade for this report), sorted
  chronologically.
- `strategy-stats.ts` -- groups by `cioVerdictLabel` + `recommendedDirection`
  (Decision D18 interpretation #1 -- the only real categorical "strategy"
  proxy `journal_entries` has), with an explicit `no_recommendation` bucket
  for entries with neither field populated. Sorted by trade count
  descending.
- `trade-distribution.ts` -- a P&L histogram whose bucket boundaries are
  computed from the real min/max `realizedPnl` across closed trades, split
  into `DEFAULT_BUCKET_COUNT` (10, overridable via `?buckets=N`) equal-width
  buckets (Decision D18 interpretation #3 -- never a fixed hardcoded
  currency threshold).
- `session-analysis.ts` -- buckets by UTC hour-of-day into four fixed
  windows (Decision D18 interpretation #2 -- explicitly UTC-clock windows,
  not a specific exchange's local trading-session schedule). Always returns
  all four windows, even empty ones.
- `instrument-analysis.ts` -- groups by `symbol`, the one unambiguous
  instrument field `journal_entries` has. Sorted by trade count descending.
- `heatmap.ts` -- day-of-week (UTC) x session-window, the same four windows
  `time-buckets.ts` defines. Always returns all 28 cells (7 days x 4
  sessions), even when a cell has zero trades.
- `time-buckets.ts` -- shared helper: `monthBucketOf()` (UTC calendar-month
  key) and `sessionWindowOf()`/`SESSION_WINDOWS` (the four fixed UTC-hour
  windows), used by `monthly-reports.ts`, `session-analysis.ts`, and
  `heatmap.ts` so all three bucket time identically.

## REST surface

All sixteen routes live in `src/app.ts`, gated by one `requireAuth`
instance (private trading history, no admin/trader split). Every GET route
accepts an optional `from`/`to` ISO-timestamp range applied in-memory over
each port's full history -- an absent bound means no floor/ceiling, never a
fabricated default range.

| Method | Path | Purpose |
|---|---|---|
| GET | `/analytics/win-rate` | Win rate over closed trades |
| GET | `/analytics/average-return` | Average return (currency + %) across closed trades |
| GET | `/analytics/risk-reward` | Planned and Realized Risk/Reward ratios |
| GET | `/analytics/expectancy` | Expected P&L per decisive trade |
| GET | `/analytics/drawdown` | Max drawdown % from the equity curve |
| GET | `/analytics/risk-adjusted-returns` | Sharpe + Sortino ratios |
| GET | `/analytics/performance` | Full combined stat rollup (all of the above in one call) |
| GET | `/analytics/monthly-reports` | One stat block per UTC calendar month |
| GET | `/analytics/strategy-stats` | Stats grouped by CIO verdict + recommended direction |
| GET | `/analytics/trade-distribution` | P&L histogram (`?buckets=N` to override the default 10) |
| GET | `/analytics/heatmap` | Day-of-week x session-window grid (28 cells) |
| GET | `/analytics/session-analysis` | Stats grouped by four fixed UTC-hour windows |
| GET | `/analytics/instrument-analysis` | Stats grouped by symbol |
| POST | `/analytics/reports` | Persist a named, point-in-time report (server-computed stats only -- a caller can supply `label`/`from`/`to`/`asOf`, never a stat column) |
| GET | `/analytics/reports` | List persisted reports, optionally bounded by `from`/`to` against each report's own `asOf` |
| GET | `/analytics/reports/:id` | Fetch one persisted report by id (404 if it doesn't exist or belongs to another user -- indistinguishable by design) |

`GET /analytics/performance` and `POST /analytics/reports` both call the
same `computeFullStatSet()` helper in `app.ts`, so a persisted report can
never disagree with what a live `/performance` call would have said at that
moment.

## Verification performed this sprint

`services/analytics`'s own suite: 14 test files, 142 tests, covering every
business-logic module in isolation (`trade-stats`, `risk-reward`,
`expectancy`, `drawdown`, `risk-adjusted-returns`, `monthly-reports`,
`strategy-stats`, `trade-distribution`, `session-analysis`,
`instrument-analysis`, `heatmap`, `time-buckets`), the full HTTP contract
(`test/app.test.ts`, 46 tests including authentication, cross-user
isolation, range filtering, and the report-persistence round trip), and
`DrizzleAnalyticsRepository`/`DatabaseJournalSource`/`DatabaseEquitySource`
against a real embedded Postgres instance (`test/repository.integration.test.ts`,
12 tests, port 55440 -- see EXECUTION_BOOK.md's port registry). The
`analytics_reports` migration was also verified against
`packages/database/test/db.test.ts`'s pg-mem suite (table creation, unique
index, and cascade/set-null FK behavior on the up and down migration paths).

Full monorepo `pnpm turbo run build`, `pnpm turbo run lint`, and
`pnpm turbo run test` all pass clean across all 18 packages/services
including this one (36/36 turbo test tasks successful, zero failures).
