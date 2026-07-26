# Tradosphere OS — Sprint Book

Stack: Node/TypeScript full stack — Next.js (web), Node/NestJS or Express (services), TypeScript everywhere, PostgreSQL + Redis, Turborepo/pnpm workspaces monorepo.

One sprint per Part (10 sprints total). Run sprint-by-sprint with the **ai-exec-team** skill: `"Atlas, read state and run Sprint N."` Atlas reads this file + REBUILD_LOG.md + EXECUTION_BOOK.md at the start of every session. No sprint starts until the Principal has signed off the previous one's Gate.

## Sprint Map

| # | Sprint | Part | Primary Owner(s) | Depends On |
|---|--------|------|-------------------|------------|
| 1 | Foundation | Part 1 | Atlas, Forge, Cipher | — |
| 2 | Infrastructure | Part 2 | Delta, Forge, Cipher | 1 |
| 3 | Market Data | Part 3 | Forge, Cipher, Delta | 2 |
| 4 | Research Engine | Part 4 | Forge, Delta | 3 |
| 5 | AI Council | Part 5 | Forge, Atlas | 4 |
| 6 | CIO Engine | Part 6 | Forge, Atlas | 5 |
| 7 | Education | Part 7 | Forge | 6 |
| 8 | Trading | Part 8 | Forge, Delta | 3, 6 |
| 9 | APIs | Part 9 | Forge, Cipher, Vega | 2–8 |
| 10 | Frontend | Part 10 | Vega, Forge | 9 |

Sprints are sequential. Nothing in a later sprint gets built early — out-of-sequence ideas go on the Parked list per Atlas's charter.

---

## Sprint 1 — Foundation

**Part:** Part 1 — Repository, standards, configuration, shared packages
**Owners:** Atlas (structure/scope), Forge (shared packages), Cipher (tooling/CI)

**Objective:** Stand up the Tradosphere-OS monorepo with working tooling, so every later sprint has a clean, buildable base to add to.

| # | Task | Owner | Depends on | Verification |
|---|------|-------|------------|---------------|
| 1.1 | Init pnpm/Turborepo monorepo matching the approved folder structure | Atlas | — | `pnpm install` succeeds |
| 1.2 | Base TS config, ESLint, Prettier shared across workspace | Forge | 1.1 | `pnpm lint` passes on empty stubs |
| 1.3 | `packages/config`, `packages/shared-types`, `packages/logger` scaffolds | Forge | 1.1 | packages build + import from a stub app |
| 1.4 | Git hooks (lint-staged/husky), commit convention | Cipher | 1.1 | bad commit is rejected locally |
| 1.5 | CI skeleton: lint + build + test on PR | Cipher | 1.2 | CI green on a trivial PR |
| 1.6 | `.env.example`, base `docker-compose.yml` (Postgres, Redis placeholders), `Makefile`, root `README.md` | Cipher | 1.1 | `docker compose config` validates |

**Exit criteria:**
- ✅/⬜ Clean clone → `pnpm install && pnpm build` succeeds
- ✅/⬜ CI pipeline runs green on an empty-content PR
- ✅/⬜ `shared-types`, `logger`, `config` packages are importable from a stub app/service
- ✅/⬜ No secret values committed anywhere (Cipher check)

---

## Sprint 2 — Infrastructure

**Part:** Part 2 — Database, authentication, logging, event bus
**Owners:** Delta (schema/migrations), Forge (auth service), Cipher (auth security, secrets)

**Objective:** Working Postgres schema + migrations, an authentication service, structured logging, and an event bus other services can publish/subscribe to.

| # | Task | Owner | Depends on | Verification |
|---|------|-------|------------|---------------|
| 2.1 | Choose + wire migration tool (Prisma or Drizzle) in `packages/database` | Delta | Sprint 1 | migration up/down round-trips cleanly |
| 2.2 | Core schema: users, sessions, roles | Delta | 2.1 | migration applies to fresh DB |
| 2.3 | `services/auth`: signup/login, JWT issue/verify, RBAC skeleton | Forge | 2.2 | auth tests pass; bad token rejected |
| 2.4 | Wire `packages/logger` (structured JSON, correlation IDs) into auth service | Forge | 1.3 | logs are structured JSON, request-traceable |
| 2.5 | Event bus (Redis pub/sub) with a test publisher/subscriber pair | Forge | Sprint 1 | end-to-end test event delivered |
| 2.6 | Security review of auth flow (token storage, expiry, secret handling) | Cipher | 2.3 | no hardcoded secrets; rotation path documented |
| 2.7 | Full local stack in `docker-compose.yml` (Postgres, Redis, auth service) | Cipher | 2.3, 2.5 | `docker compose up` boots a working auth service |

**Exit criteria:**
- ✅/⬜ Migrations run cleanly up and down against a fresh database
- ✅/⬜ Auth service issues and validates JWTs, covered by tests
- ✅/⬜ Logger emits structured, correlation-traceable logs
- ✅/⬜ Event bus delivers a test event end-to-end
- ✅/⬜ No credential ever appears in code, logs, or docs (Cipher gate)

---

## Sprint 3 — Market Data

**Part:** Part 3 — SMC Global adapter, live feeds, normalization
**Owners:** Forge (adapter + market-data service), Cipher (credential handling), Delta (storage/validation)

**Objective:** A rate-limited SMC Global broker adapter feeding normalized live and historical market data into the platform — with no fabricated data under any failure condition.

| # | Task | Owner | Depends on | Verification |
|---|------|-------|------------|---------------|
| 3.1 | `services/broker/smc`: authenticated, rate-limited, retrying SMC Global client | Forge | Sprint 2 | integration test against sandbox/live creds |
| 3.2 | Credential handling for SMC Global (names only in code, values via env/secret store) | Cipher | 3.1 | secret scan passes |
| 3.3 | `services/market-data`: live tick ingestion + normalization to `shared-types` schema | Forge | 3.1 | normalized ticks match schema on sample feed |
| 3.4 | WebSocket streaming layer for live ticks to internal consumers | Forge | 3.3 | subscriber receives live stream in test |
| 3.5 | Historical data import pipeline (idempotent, row-count logged) | Delta | 3.3 | re-running import doesn't duplicate rows |
| 3.6 | Fail-loud behavior verified: simulate feed outage, confirm explicit error (never mock/stale-as-fresh data) | Forge | 3.3 | simulated outage produces error, not fake data |

**Exit criteria:**
- ✅/⬜ Adapter authenticates against SMC Global (Principal supplies credentials)
- ✅/⬜ Normalized live ticks flow into cache/DB matching shared schema
- ✅/⬜ Historical import is idempotent and logs row counts
- ✅/⬜ Simulated feed outage produces a loud, explicit error — verified live by the Principal

---

## Sprint 4 — Research Engine

**Part:** Part 4 — Technical, options, fundamental, sector, quant analysis
**Owners:** Forge (analysis modules), Delta (fundamental/sector data feeds)

**Objective:** A `services/research` engine producing typed, tested analysis output across five disciplines, with explicit gaps instead of fabricated results when data is missing.

| # | Task | Owner | Depends on | Verification |
|---|------|-------|------------|---------------|
| 4.1 | Technical indicator library in `knowledge/indicators` (RSI, EMA, MACD, volume, breakout detection) | Forge | Sprint 3 | unit tests against fixture price series |
| 4.2 | Option chain analysis module (PCR, OI shift, writing/unwinding detection) | Forge | Sprint 3 | unit tests against fixture chain data |
| 4.3 | Fundamental analysis module + data feed (financials ingestion) | Delta + Forge | Sprint 3 | ingested financials validate before insert |
| 4.4 | Sector analysis module (relative strength, rotation) | Forge | 4.1 | unit tests against fixture sector data |
| 4.5 | Quant analysis module (statistical signal set) | Forge | 4.1 | unit tests against fixture data |
| 4.6 | Standardize all module outputs against `shared-types` research schema | Forge | 4.1–4.5 | schema validation test suite passes |

**Exit criteria:**
- ✅/⬜ Each of the five analysis modules returns typed, tested output on fixture data
- ✅/⬜ Missing/insufficient input data produces an explicit gap, never a fabricated result
- ✅/⬜ All module outputs conform to one shared schema

---

## Sprint 5 — AI Council

**Part:** Part 5 — Specialized expert agents and shared schemas
**Owners:** Forge (agent implementation), Atlas (schema/contract discipline)

**Objective:** Nine expert agents (Technical, Options, Sector, Quant, Strategy, Risk, Fundamental, Indices, Education) that each consume Research Engine output and produce a structured, schema-valid opinion.

| # | Task | Owner | Depends on | Verification |
|---|------|-------|------------|---------------|
| 5.1 | Agent framework in `services/ai` (shared opinion schema: verdict, confidence, reasoning trace) | Forge | Sprint 4 | schema compiles, one dummy agent conforms |
| 5.2 | Implement Technical, Options, Sector, Quant, Fundamental, Indices agents | Forge | 5.1 | each returns schema-valid opinion on fixture input |
| 5.3 | Implement Strategy and Risk agents | Forge | 5.1 | each returns schema-valid opinion on fixture input |
| 5.4 | Implement Education agent (explanatory layer, used again in Sprint 7) | Forge | 5.1 | returns schema-valid plain-language explanation |
| 5.5 | Prompt library versioned in `knowledge/prompts` | Forge | 5.1 | prompts tracked in git, referenced by agent code (not inlined ad hoc) |

**Exit criteria:**
- ✅/⬜ All 9 agents produce schema-valid opinions from the same fixture dataset
- ✅/⬜ No agent output bypasses the shared opinion schema
- ✅/⬜ Prompts are version-controlled, not hardcoded per-agent strings

---

## Sprint 6 — CIO Engine

**Part:** Part 6 — Consensus, conflict resolution, explainable recommendations
**Owners:** Forge (engine logic), Atlas (decision-policy review)

**Objective:** A `services/cio` engine that aggregates all agent opinions into one explainable verdict with confidence, and generates concrete trade ideas.

| # | Task | Owner | Depends on | Verification |
|---|------|-------|------------|---------------|
| 6.1 | Consensus/weighting algorithm across all 9 agent opinions | Forge | Sprint 5 | deterministic output on fixed fixture opinions |
| 6.2 | Conflict resolution rules (e.g., Risk agent veto power) | Forge | 6.1 | test case: Risk veto blocks a bad idea |
| 6.3 | Confidence scoring + full explainability trace (which agent said what, why) | Forge | 6.1 | trace reproduces the verdict from raw opinions |
| 6.4 | Trade idea generator (entry, stop-loss, target, R:R) | Forge | 6.1 | generated idea has valid, consistent numbers |
| 6.5 | Atlas review: decision policy matches the "CIO gives final verdict" design from the vision doc | Atlas | 6.1–6.4 | walkthrough against vision doc confirms match |

**Exit criteria:**
- ✅ CIO produces one verdict + confidence + explainability trace from a fixed set of agent opinions — `cio.test.ts`'s 9-opinion fixture case, backed by `trace.test.ts`'s `reproduceVerdictFromTrace` proof
- ✅ Risk veto demonstrably blocks a bad trade idea in a test case — `cio.test.ts`'s three Level 1 veto cases (bad R:R, drawdown at limit, invalid data), backed by `risk-gate.test.ts`'s 14 cases
- ✅ Trade idea output includes entry/SL/target/R:R, all internally consistent — `trade-idea.test.ts`'s 22 cases, including a checked-invariant R:R computed from the returned numbers, not restated from input

---

## Sprint 7 — Education

**Part:** Part 7 — AI tutor, glossary, courses, strategy library
**Owner:** Forge (education service)

**Objective:** An education layer that explains every CIO output in plain language and hosts glossary/course/strategy content, per the "it teaches while analyzing" vision.

| # | Task | Owner | Depends on | Verification |
|---|------|-------|------------|---------------|
| 7.1 | `services/education`: glossary API, strategy library, course content model | Forge | Sprint 6 | CRUD/read endpoints tested |
| 7.2 | Populate `knowledge/glossary`, `knowledge/courses`, `knowledge/strategies` with an initial content set | Forge | 7.1 | content queryable via API |
| 7.3 | AI tutor endpoint: explains any CIO/agent output on demand (reuses Education agent from Sprint 5) | Forge | 5.4, 7.1 | tutor explains a sample trade idea end-to-end |
| 7.4 | Wire "this setup is called..." annotation into every CIO trade idea | Forge | Sprint 6, 7.3 | every generated trade idea carries an education annotation |

**Exit criteria:**
- ✅ Tutor endpoint explains a sample trade idea end-to-end in plain language — `POST /tutor/explain` (opinions → plain-language `EducationAgent` narrative) and `POST /annotations/trade-idea` (a real `TradeIdea` → the same idea back with a plain-language `educationNote` attached), both reusing Sprint 5's `EducationAgent` per task 7.3's spec, covered end-to-end over real HTTP in `app.test.ts`'s "tutor & annotation" suite (4 tests)
- ✅ Glossary/course/strategy content is queryable via API — `seed.integration.test.ts` proves this against real Postgres + the real Fastify app: `/categories`, `/tags`, `/glossary` + `/glossary/:slug`, `/courses/:slug` + ordered `/lessons`, `/quizzes/:slug/questions` (redacted), `/strategies/:slug`, `/content/:contentType/:contentId/tags` (8 tests)
- ✅ Every CIO trade idea includes an education annotation — Decision D13: `buildCioVerdict()` (`services/cio/src/cio.ts`) now finds the `expert: 'education'` opinion already present in its own `input.opinions` array and passes its `reasoning[0]` into `generateTradeIdea()`'s pre-existing (Sprint 6, task 6.4) `educationNote` parameter. `services/cio` and `services/education` remain fully isolated as *services* — no import or runtime call between them, Decision D12's isolation intact and Decision D9's shared-types-only dependency untouched — this reads data Sprint 6 already threaded through consensus, it does not add a service dependency. Proven by `cio.test.ts`: every generated trade idea carries the real Education opinion's `educationNote` when one is supplied (updated 9-opinion fixture case), and the note is left honestly unset — never fabricated — when no Education opinion is supplied or its `reasoning` is empty (2 new cases). 10/10 `cio.test.ts` tests, 70/70 `services/cio` tests, 382/382 full-repo tests (380 passed + 2 expected Blocker-B5 skips) pass clean.

---

## Sprint 8 — Trading

**Part:** Part 8 — Paper trading, journal, portfolio, analytics
**Owners:** Forge (paper-trading/portfolio services), Delta (journal/portfolio schema)

**Objective:** Simulated trading against real market prices, a journal linking trades to CIO recommendations, portfolio tracking, and basic performance analytics.

| # | Task | Owner | Depends on | Verification |
|---|------|-------|------------|---------------|
| 8.1 | `services/paper-trading`: simulated order execution against live/near-live prices | Forge | Sprint 3, 6 | fills use real market price, never fabricated |
| 8.2 | Journal schema + entries linking trade → CIO recommendation → actual outcome | Delta | 8.1 | schema migration applies; entries link correctly |
| 8.3 | `services/portfolio`: holdings, P&L, exposure | Forge | 8.1, 8.2 | P&L reconciles against seeded test trades |
| 8.4 | `services/analytics`: win rate, realized R:R, drawdown | Forge | 8.3 | stats verifiable by hand against seeded data |

**Exit criteria:**
- ✅ Paper orders fill against real market prices, verified against a simulated feed — `execution.test.ts`'s 11 unit cases (exact-price stamping, `NoMarketDataError` on missing data, deterministic fills) plus `price-source.integration.test.ts`'s 6 cases against real seeded Postgres `market_ticks` rows (fed by Sprint 3's `SimulatedBrokerClient` per D5): fills are the literal tick price, never invented, never a cached/stale one
- ✅ Portfolio P&L reconciles against journal entries for seeded test trades — `services/portfolio`'s `mtm.ts` computes `totalEquity = startingCash + realizedPnl + unrealizedPnl` directly from `journal_entries` (via `JournalTradeRecordSource`, no separate trades table); `test/mtm.test.ts`/`test/app.test.ts` cross-check that identity equals `cashBalance + positionsValue` independently against in-memory fakes, and `test/repository.integration.test.ts` proves the persisted snapshot form against real seeded Postgres (9 files, 91 tests total, `services/portfolio` suite)
- ✅ Analytics numbers match hand-calculation on the same seeded dataset — `services/analytics`'s unit suites independently derive each expected stat outside the implementation, then assert exact equality against fixture trade/equity data: `trade-stats.test.ts` (win rate = 1 win / (1 win + 1 loss) = 0.5), `expectancy.test.ts` ((2/3)×150 − (1/3)×50), `risk-reward.test.ts` (planned R:R mean = 3; realized R:R = 150/50 = 3), `drawdown.test.ts` (peak 100→trough 80→peak 120→trough 60 = 0.5 max drawdown; 200→150 = 0.25), and `risk-adjusted-returns.test.ts` (Sharpe/Sortino hand-derived to 8 decimal places: 0.054772256 / 0.141421356) — 14 files, 142 tests total, plus `repository.integration.test.ts`'s 12 cases proving the persisted report form matches the same computation against real seeded Postgres (port 55440)

---

## Sprint 9 — APIs

**Part:** Part 9 — REST, WebSocket, SDKs
**Owners:** Forge (contract + gateway), Cipher (auth/rate limiting), Vega (SDK consumption readiness)

**Objective:** A single approved API contract exposed through `apps/api`, with auth, rate limiting, WebSocket streaming, and a generated typed SDK — the only way the frontend (Sprint 10) is allowed to talk to the backend.

| # | Task | Owner | Depends on | Verification |
|---|------|-------|------------|---------------|
| 9.1 | Finalize OpenAPI contract covering auth, market-data, research, ai, cio, education, paper-trading, portfolio | Forge | Sprints 2–8 | spec validates; Principal approves contract |
| 9.2 | `apps/api` gateway: routing, auth middleware, rate limiter, request logging | Forge | 9.1 | bad/unauthenticated request rejected in test |
| 9.3 | WebSocket gateway for live market/CIO updates | Forge | 9.1, Sprint 3 | client receives live updates in test |
| 9.4 | Cipher review: auth-by-default, rate limiter actually blocks abuse | Cipher | 9.2 | simulated abusive client gets rate-limited |
| 9.5 | `packages/sdk`: generated typed client from the approved OpenAPI spec | Forge | 9.1 | SDK compiles, hits a live endpoint successfully |

**Exit criteria:**
- ✅ OpenAPI spec approved by Principal and covers every used endpoint — `openapi.yaml` (80 path items, 103 operations, 109 schemas, zero duplicate `operationId`s/dangling `$ref`s, passes `openapi_spec_validator.validate()`), approved by Anshh
- ✅ Gateway enforces auth and rate limits, verified by a deliberately bad request — `apps/api/test/app.test.ts` covers auth-required across all 20 in-process routes plus a dedicated 429-on-exceeded-limit test
- ✅ Generated SDK compiles and successfully calls a live endpoint — `apps/api/test/sdk.test.ts` (4 tests, added to close Blocker B17): real `TradosphereClient` against a real bound `app.listen()` port, covering a public call, an authenticated round trip, a 401, and a 404-mapped `SdkHttpError`

---

## Sprint 10 — Frontend

**Part:** Part 10 — Trading OS interface, dashboards, AI workspace
**Owners:** Vega (all screens), Forge (contract support as needed)

**Objective:** The Tradosphere OS interface from the vision doc — live market bar, CIO verdict, expert status row, trade ideas, and the full "click a trade idea → see the full breakdown" flow — built entirely on the generated SDK with no placeholder data.

| # | Task | Owner | Depends on | Verification |
|---|------|-------|------------|---------------|
| 10.1 | `apps/web` shell: live market bar, market regime, CIO verdict panel, expert status row | Vega | Sprint 9 | renders real data via SDK, explicit loading/error states |
| 10.2 | Trade ideas feed + trade idea detail view (technical/options/sector/macro/risk/education breakdown) | Vega | 10.1 | detail view matches vision doc's breakdown layout |
| 10.3 | Paper trading, journal, portfolio, watchlist screens | Vega | 10.1, Sprint 8 | each screen reflects live backend state, zero placeholders |
| 10.4 | AI chat / workspace screen | Vega | 10.1, Sprint 7 | chat calls tutor endpoint via SDK, no hardcoded replies |
| 10.5 | Data-freshness indicators (STALE badge) wherever data can go stale | Vega | 10.1–10.4 | manually staled data shows the badge |

**Exit criteria:**
- ✅/⬜ Build passes clean (zero errors)
- ✅/⬜ Every screen renders through the typed SDK client only, with explicit loading/error/stale states — zero placeholder data
- ✅/⬜ Principal personally walks through: open OS → see live market + CIO verdict → click a trade idea → see full technical/options/sector/risk/education breakdown

---

## How to Run a Sprint

1. Say: `"Atlas, read state and run Sprint N."`
2. Atlas reads this file + `REBUILD_LOG.md` + `EXECUTION_BOOK.md`, restates the objective, and presents the task table above for approval.
3. You approve (or edit) the task table.
4. Builders build, cross-review, and Atlas runs the Gate against this sprint's exit criteria.
5. You personally verify exit criteria and give sign-off — only then does the next sprint unlock.
6. At major milestones (end of Sprint 3, Sprint 6, Sprint 9, and before anything touches real money), run **ai-team** to audit what was built before continuing.
