# Portfolio Engine (Sprint 8.3)

## Status

`services/portfolio` is built and verified. It has no HTTP dependency on
`services/paper-trading` or `services/journal` -- it reads their durable
output (`journal_entries`, `market_ticks`) directly through
`@tradosphere/database`, the same one-directional service-isolation
precedent Decisions D9/D12 established and D17 (EXECUTION_BOOK.md) extends
here. Every trade a user has made and every position they hold is derived
fresh on every call from that data -- nothing is cached or pre-aggregated,
so there is no separate "rebuild the portfolio" step that can drift from
the underlying trades.

## The two ports (why live broker sync is a plug-in, not a rewrite)

The Principal's constraint for this task was explicit: use interfaces so
live broker synchronization can be added later without changing the
Portfolio module. Two ports carry that weight:

1. **`TradeRecordSource`** (`src/trade-record-source.ts`) -- answers "what
   trades has this user made." The real adapter, `JournalTradeRecordSource`,
   reads `journal_entries` (Decision D16's paper-trading journal, the only
   point of persistence for a paper fill today). A future live-broker
   integration only needs a second class implementing the same
   `listByUser(userId): Promise<TradeRecord[]>` method -- reading fills from
   a real broker's trade-history API instead of `journal_entries` -- swapped
   in at `src/index.ts`'s construction site. `positions.ts`, `cash.ts`,
   `pnl.ts`, and every route in `app.ts` depend only on the interface and
   never change.
2. **`PriceSource`** (`src/price-source.ts`) -- answers "what is this
   symbol worth right now." The real adapter, `DatabasePriceSource`, reads
   the latest row in `market_ticks` (the same table `services/market-data`
   fills and `services/paper-trading` already reads through its own
   byte-for-byte-identical port, kept deliberately duplicated rather than
   imported, per the same isolation precedent). A future live/streaming
   price feed is a second class implementing `getLatestPrice(symbol):
   Promise<RealTimePrice | undefined>`, swapped in the same way.

Both ports already have `test/fakes.ts` in-memory implementations
(`InMemoryTradeRecordSource`, `InMemoryPriceSource`) that back all unit and
HTTP-contract tests without touching Postgres -- proof today that the
business logic genuinely depends only on the interface, not on Postgres or
on any particular adapter's internals.

A third port, **`PortfolioRepository`** (`src/portfolio-repository.ts`),
answers "persist and list this user's historical snapshots" against the new
`portfolio_snapshots` table. `DrizzlePortfolioRepository` is its only
adapter today; `user_id` uses `ON DELETE SET NULL` (same reasoning as
`journal_entries.user_id`) so deleting a trader's account never deletes or
blocks deleting their equity history.

## Business logic map

Each module does exactly one job and is unit-tested in isolation:

- `positions.ts` -- nets a user's trades per symbol into open `Position`s
  (quantity-weighted average entry price, alphabetical by symbol, exact-zero
  net positions dropped).
- `cash.ts` -- walks every trade against `DEFAULT_STARTING_CASH` (env
  `PORTFOLIO_STARTING_CASH`, default 100,000; Decision D17 -- every paper
  account starts from the same figure, there is no deposit/funding flow yet)
  to produce the current cash balance.
- `pnl.ts` -- realized P&L from closed trades, unrealized P&L from open
  positions against their current price.
- `mtm.ts` -- `computeMarkToMarket()` is the one place all of the above are
  pulled together: prices every open position exactly once (so
  `positionsValue`, `unrealizedPnl`, allocation, and risk all agree on the
  same price within one request) and reports both the P&L walk-forward view
  and the balance-sheet view of equity.
- `performance.ts` -- total return in currency and percent against starting
  cash.
- `allocation.ts` -- each position's share of gross exposure.
- `risk.ts` -- gross/net exposure, leverage ratio, largest-position
  concentration.

## The reconciliation identity

Decision D17's central correctness proof, and the literal verification
criterion SPRINT_BOOK.md sets for task 8.3 ("P&L reconciles against seeded
test trades"):

```
totalEquity = startingCash + realizedPnl + unrealizedPnl   (P&L walk-forward)
            = cashBalance + positionsValue                  (balance sheet)
```

`mtm.ts` computes the left-hand form directly; `test/mtm.test.ts` and
`test/app.test.ts` (`GET /portfolio/summary`) both assert the right-hand
form equals it independently, against both in-memory fakes and (in
`test/repository.integration.test.ts`) a real seeded Postgres database. A
position or price PriceSource has no data for is never treated as zero --
it's excluded from both sides consistently and surfaced in
`missingPriceSymbols`, and `POST /portfolio/snapshot` refuses to persist a
snapshot at all while any symbol is unpriced (409, not a silent gap) since
a snapshot is a permanent historical row.

## REST surface

All nine routes live in `src/app.ts`, gated by one `requireAuth` instance
(private account data, no admin/trader split):

| Method | Path | Purpose |
|---|---|---|
| GET | `/portfolio/positions` | Current open positions |
| GET | `/portfolio/cash` | Current cash balance |
| GET | `/portfolio/pnl` | Realized + unrealized P&L |
| GET | `/portfolio/summary` | Full mark-to-market view |
| POST | `/portfolio/snapshot` | Persist a point-in-time snapshot (409 if any open position is unpriced) |
| GET | `/portfolio/history` | Persisted snapshots, optionally bounded by `from`/`to` |
| GET | `/portfolio/performance` | Total return vs. starting cash |
| GET | `/portfolio/allocation` | Each position's share of gross exposure |
| GET | `/portfolio/risk` | Gross/net exposure, leverage, concentration |

## Verification performed this sprint

`services/portfolio`'s own suite: 9 test files, 91 tests, covering every
business-logic module in isolation, the full HTTP contract (`test/app.test.ts`,
27 tests including authentication, cross-user isolation, and the 409
incomplete-pricing path), and `DrizzlePortfolioRepository` against a real
embedded Postgres instance (`test/repository.integration.test.ts`, 7 tests,
including the `ON DELETE SET NULL` FK proof). Full monorepo `pnpm build`
and `pnpm lint` both pass clean including this package. See
EXECUTION_BOOK.md Blocker B13 for one unrelated, pre-existing test
collision (`services/education` vs. `services/paper-trading`, both from
prior sprints) that a full-repo `pnpm test` can intermittently surface --
`services/portfolio`'s own tests are unaffected and pass cleanly every run.
