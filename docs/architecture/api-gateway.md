# API Gateway (Sprint 9)

## Status

`apps/api` is built and verified. It is the single public entrypoint for
every other Tradosphere OS service (auth, market-data, education, portfolio,
analytics, research, ai, cio, paper-trading, journal) plus real-time
streaming, and it is the first consumer to exercise every one of those
services together in the same process boundary. Decision D19
(EXECUTION_BOOK.md) is the master design record for everything below; this
document explains the resulting code, not a second design discussion.

## Route split: proxy vs. in-process (D19 (1))

Ten services sit behind the gateway, split by whether they already have
their own HTTP surface:

- **Proxied (5)** -- auth, market-data, education, portfolio, analytics
  already run their own Fastify app from earlier sprints. `src/proxy.ts`'s
  `registerProxy()` forwards every request under a service's prefix to that
  service's real base URL via a hand-rolled wildcard route, never
  `@fastify/http-proxy`. Each upstream stays the sole authority for its own
  routes -- the gateway does not re-implement or re-check auth, RBAC, or
  validation for these five; it forwards the `Authorization` header (and
  every other non-hop-by-hop header) through byte-for-byte and lets the
  downstream service decide, exactly as it already does when called
  directly.
- **In-process (5)** -- research, ai, cio, paper-trading, journal are
  library packages with no HTTP surface of their own. `src/app.ts` gives
  each a new route directly inside the gateway, calling into the library
  function the same way that service's own tests already do.

### Prefix stripping is not uniform (D20)

`ProxyTarget.stripPrefix` differs by how each upstream mounts its own
routes: auth, market-data, and education mount root-level
(`app.post('/signup', ...)`), so `stripPrefix` equals the full
`/v1/<service>` prefix. Portfolio and analytics already self-prefix every
route (`app.get('/portfolio/positions', ...)`), so `stripPrefix` is only
`/v1` for those two -- stripping the service name too would double-strip
and 404 every request. This asymmetry is read directly from each service's
own `app.ts`, not assumed.

### The proxy forwards bytes verbatim -- and a bug in that guarantee (B15)

`registerProxy()` registers a raw-buffer content-type parser in its own
encapsulated child scope so a proxied body is never JSON-parsed and
re-serialized by the gateway -- validation is each downstream service's own
job, same as if the caller had reached it directly. The first version of
this parser was registered only for `'*'`, which Fastify's built-in default
`application/json`/`text/plain` parsers silently out-ranked (an exact
content-type match always wins over a wildcard, even in a child scope). A
caller sending `Content-Type: application/json` -- the common case -- would
have had its body parsed into a JS object before `proxyRequest()` ever ran,
which then serialized to the literal string `"[object Object]"` when
forwarded via `fetch()`. Fixed by calling
`scope.removeAllContentTypeParsers()` before registering the `'*'` buffer
parser, so no inherited parser can out-rank it. See Blocker B15
(EXECUTION_BOOK.md) for the full discovery/fix/verification trail -- this
was a genuine, previously-shipped production bug, caught only because task
9.15's test suite drives the proxy against a real `http.Server` with a real
JSON body, not just asserted wiring.

### Unreachable vs. down (D21)

`GET /health/services` treats **any** HTTP response from a proxied
target -- including a 404 -- as `'ok'`, and only a network-level failure
(`fetch` itself rejecting) as `'unreachable'`. Only `market-data` actually
implements its own `/health` route; the other four proxied services don't,
so a naive "require 200 on `/health`" check would misreport four healthy
services as permanently down.

## Auth model (D19 (2))

The gateway's own `requireAuth` (identical factory pattern to every
existing service) gates only the 10 in-process routes. Proxied routes are
never re-authenticated at the gateway -- a second, possibly-divergent auth
check in front of a service that already runs its own would add risk
without benefit, and would break public proxied routes (e.g.
`GET /v1/education/categories`) that the gateway has no route-by-route
knowledge of.

## Versioning and infra routes (D19 (3))

`/v1/<service>/...` uniformly for both proxied and in-process routes.
Infrastructure routes are unversioned: `GET /health`, `GET /health/services`,
`GET /metrics`, `GET /openapi.yaml`, `GET /documentation`, and the `/stream`
WebSocket upgrade path.

## Rate limiting (D19 (4))

`@fastify/rate-limit`, registered globally, `await`-ed before route
declarations (same ordering `services/auth/src/app.ts` already
established), Redis-backed, namespaced `tradosphere-gateway-rl-` so its
counters never collide with any service's own limiter. Configured via
`GATEWAY_RATE_LIMIT_PER_MIN` (default 300/min) -- deliberately never
`RATE_LIMIT_PER_MIN`, which `.env.example`'s own comment reserves for
`services/auth` specifically.

## WebSocket layer (D19 (5))

`src/websocket.ts`'s `GatewayStreamServer` wraps a `ws` `WebSocketServer`
on the same underlying `http.Server` Fastify already owns, handling
upgrades on `/stream` only (any other path gets its socket destroyed, no
auth -- an intentional, unauthenticated infra route per `openapi.yaml`). It
fans two event-bus channels into every connected client, tagging each
message by type:

- `market.ticks` (`MARKET_TICKS_CHANNEL`, promoted from
  `services/market-data`'s own constant into a new shared
  `packages/event-bus/src/channels.ts`) -> `{ type: 'market.tick', payload }`
- `cio.verdicts` (`CIO_VERDICTS_CHANNEL`, new this sprint) ->
  `{ type: 'cio.verdict', payload }`, published by `POST /v1/cio/verdict`
  after computing each verdict -- CIO verdicts were never previously
  published anywhere.

`clientCount`, `send()`, and `close()` (unsubscribes both channels and
terminates every connected client) round out the class. No precedent WS
test existed anywhere in the repo for this shape (`services/market-data`'s
own `TickStreamServer` has none either), so `test/websocket.test.ts` was
authored from scratch against a real `http.Server` and a real `ws` client.

## Research/CIO scope boundaries accepted this sprint (D19 (7), (8))

`services/research`'s technical/quant/sector modules and
`services/paper-trading`/`services/cio` take their market/portfolio inputs
directly in the request body (`bars`, `sectorBars`, `benchmarkBars`,
`OptionChainSnapshot`, `PortfolioRiskContext`, `dataValid`) rather than the
gateway fetching or auto-wiring them internally. `MarketDataRepository`
only stores raw ticks (no tick-to-bar aggregation pipeline exists), and
`services/portfolio`'s `RiskExposure` shape doesn't match `services/cio`'s
`PortfolioRiskContext` (no drawdown computation exists in portfolio at
all). Building either pipeline is out of scope for a gateway sprint;
callers supply the data today.

## OpenAPI, SDK, and metrics (D19 (9), (10))

- **`openapi.yaml`** -- hand-authored and committed, served verbatim via
  `GET /openapi.yaml` (a plain file read, always fresh from disk) plus a
  minimal `GET /documentation` HTML shell loading Swagger UI from CDN. 80
  path items, 103 operations, 109 schemas; zero duplicate `operationId`s,
  zero dangling `$ref`s; passes `openapi_spec_validator.validate()`.
- **`packages/sdk`** -- a hand-written typed client (`PortfolioClient`,
  `AnalyticsClient`, and one client per remaining domain) matching
  `@tradosphere/shared-types` and the gateway's real route shapes exactly,
  not runtime codegen -- avoids a new, unproven build-time dependency for a
  single-pass sprint.
- **`/metrics`** -- `prom-client`, a module-scoped `Registry` (avoids
  "metric already registered" across multiple `buildApp()` calls in tests),
  default Node process metrics plus a custom `http_requests_total` Counter
  and `http_request_duration_seconds` Histogram recorded via an
  `onResponse` hook.

## Verification performed this sprint (task 9.15)

- **`apps/api/test/app.test.ts`** -- 51 tests driving the real `buildApp()`
  through `app.inject()` against a real `http.Server` standing in for "any
  proxied service" (since `proxy.ts`'s own `fetch()` call is a genuine
  network call `inject()` alone can't exercise). Covers: all 5 infra
  routes, all 5 proxied targets (prefix-stripping for both stripPrefix
  conventions, header forwarding, body relay, 4xx passthrough, 502 on a
  genuinely unreachable target), authentication across all 20 in-process
  routes, the 5 research routes, all 9+2 AI Council/CIO routes, the 4
  paper-trading/journal outcome paths, rate limiting (429 once the
  configured max is exceeded), and the generic 500 handler (an unexpected,
  untyped error never leaks internals).
- **`apps/api/test/websocket.test.ts`** -- 7 tests against a real `ws`
  client and a real bound port: unauthenticated upgrade accepted on
  `/stream`, any other path destroyed, each channel tagged and broadcast
  correctly, both channels fan into one connection, no broadcast after
  disconnect, and `close()` unsubscribes and terminates cleanly.
- Running this suite for the first time surfaced two real bugs neither
  visible from unit-level testing alone -- **Blocker B15** (the proxy
  content-type-parser precedence bug above, a genuine production
  data-corruption fix) and **Blocker B16** (an `ioredis-mock`
  shared-state-by-default test-isolation gap, fixed with an explicit
  `flushall()` per test app). Full detail, root-cause evidence, and
  resolution verification for both are in EXECUTION_BOOK.md's Blocker Log.
- After both fixes: `@tradosphere/api` alone -- build clean, lint clean,
  test 58/58 (0 failures). Full monorepo `pnpm build`/`pnpm lint`/`pnpm
  test` from a fresh sync -- 19/19 build tasks, 19/19 lint tasks, 38/38
  test tasks, zero regressions across every service and shared package.
- **Blocker B17** (found during this same sprint's final verification, before
  Principal sign-off): `packages/sdk` had zero tests and nothing repo-wide
  ever instantiated `TradosphereClient` -- the suite above proves the gateway
  works via `inject()`, which never touches the SDK's own transport code.
  Closed with `apps/api/test/sdk.test.ts` (4 tests) driving a real
  `TradosphereClient` against a real bound `app.listen()` socket. After this
  fix: `@tradosphere/api` alone -- 62/62 (0 failures). Full monorepo build
  19/19, lint 19/19, test 38/38 tasks, zero regressions.
- **Blocker B18** (found by the independent `ai-team` audit, post-sign-off):
  `pnpm-lock.yaml` had never been regenerated after `packages/sdk` was
  created or after B17 added `@tradosphere/sdk` as a devDependency of
  `apps/api`, so `pnpm install --frozen-lockfile` -- CI's first step --
  failed outright. Resolved: lockfile regenerated and committed (see
  `EXECUTION_BOOK.md`'s Blocker Log); `pnpm install --frozen-lockfile`
  independently reconfirmed clean, alongside build 19/19, lint 19/19, test
  38/38.
