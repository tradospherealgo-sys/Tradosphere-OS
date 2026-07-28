# Web Frontend (Sprint 10)

## Status

`apps/web` is a Next.js 14 App Router application. Phase 10.1 (Foundation)
covers scaffolding, the typed SDK client, authentication, the theme system,
and the responsive shell/nav. Phases 10.2-10.6 (SPRINT_BOOK.md) add the
remaining 19 workspaces/screens on top of this foundation. Decision D22
(EXECUTION_BOOK.md) is the scope/phasing record; this document explains the
resulting Foundation code.

## The Broker-abstraction guarantee (hard constraint)

Sprint 10's kickoff spec requires: "The frontend must use the Broker
abstraction only. No SMC Global specific code. The UI must automatically
work once the future Broker adapter begins producing live data." This is
enforced structurally, not just by convention: `src/lib/sdk.ts` is the one
and only file in `apps/web` that constructs a `TradosphereClient` or reads
`NEXT_PUBLIC_API_BASE_URL`. Every screen imports `sdk` from that module and
calls `sdk.<domain>.<method>()`. Because the gateway (Sprint 9) already sits
behind the `BrokerClient` port (Decision D5) and `apps/web` only ever speaks
to the gateway through this one typed client, swapping the simulated broker
for a real one later requires zero frontend changes.

## Session/token handling

`src/lib/token-store.ts` is the only file that touches `localStorage`. It
lazily hydrates a module-level session on first access (`getSession()`),
and exposes `getAccessToken()` as the function passed directly into
`SdkConfig.getAccessToken` in `sdk.ts` -- no component reads or writes
tokens directly.

## Auth flow

`src/lib/auth-actions.ts` holds `login()`, `logout()`, and `restoreSession()`
as plain, testable functions (kept separate from the React wiring in
`auth-context.tsx` so `apps/web/test/auth-flow.test.ts` can drive a real
round trip against a real bound stand-in server without a DOM/React
renderer). `restoreSession()` calls the real gateway's `GET /v1/auth/me`;
on a 401 it attempts exactly one refresh-then-retry before clearing the
session. It never fabricates a user on failure, and a network/5xx failure
does not silently log the user out (Vega charter rule 1: no placeholder
value ever stands in for real data).

`src/lib/auth-context.tsx` wraps this in a `useAuth()` hook; the
`(app)/layout.tsx` route-group layout is the auth guard -- it shows a
loading state while `restoreSession()` resolves, then redirects to
`/login` if unauthenticated or renders `AppShell` if authenticated.

## Theme system

CSS custom properties (`--color-*`) in `globals.css` are switched via a
`data-theme="light"|"dark"` attribute on `<html>`, consumed by Tailwind
through the `rgb(var(--color-x) / <alpha-value>)` token pattern in
`tailwind.config.ts`. `theme-context.tsx` persists the choice to
`localStorage` and falls back to `prefers-color-scheme` on first visit.

## Responsive shell

`components/app-shell.tsx` renders a fixed sidebar on desktop (`md:block`)
and a top bar + slide-over panel on mobile, driven by `components/
nav-items.ts`'s `NAV_ITEMS` list, which covers all 19 Sprint 10 areas.
Only Dashboard has a real `href` in phase 10.1; every other item renders
disabled with a "Soon" badge rather than linking to a page that doesn't
exist yet or rendering fabricated content for a workspace not yet built.

## Testing

`apps/web/test/auth-flow.test.ts` starts a real bound `http.Server`
implementing the `/v1/auth` contract (mirroring `apps/api/test/
app.test.ts`'s `startFakeUpstream()` and the Blocker-B17 real-bound-socket
pattern in `apps/api/test/sdk.test.ts`), sets
`NEXT_PUBLIC_API_BASE_URL` to that server's bound port, then dynamically
imports `auth-actions.ts`/`token-store.ts` so `sdk.ts` picks up the test
URL. It proves `login()`, `restoreSession()` (including the one-shot
refresh-on-401 path), and `logout()` genuinely exercise
`@tradosphere/sdk`'s real HTTP transport -- no mocked SDK, no `apps/api`
import (Sprint 10 does not modify or depend on backend internals; it
depends only on the already-shipped SDK and gateway contract).
