# Sprint 10 — QA Review & Acceptance Audit

**Status:** Sprint 10 is NOT approved. This package is preparation for your manual review only — no code has been written or changed to produce it. It was built by re-reading the actual route files, component files, and `SPRINT_BOOK.md`'s original Sprint 10 phase table (not from memory of what was reported built), specifically to check delivered work against the *original* spec, not just against what was later agreed to narrow it to.

**Companion document:** `SPRINT_10_ACCEPTANCE_CHECKLIST.md` (same folder) has a deeper 15-field breakdown per feature — loading/empty/error states, responsive behaviour, accessibility checks, edge cases. This document is the QA-report-formatted package you just asked for: route/URL, expected behaviour, backend API, test steps, expected result, and failure cases, plus the four-way status report and page-by-page walkthrough order. Use this one to drive the review; use the other one if you want more depth on a specific feature as you go.

**Important finding surfaced while preparing this:** the original Sprint 10 phase table in `SPRINT_BOOK.md` (lines 240–247) scoped more than what ended up shipping in three places — Research/CIO detail breakdown, Trading's Watchlist, and 10.6's automated accessibility check. Each scope cut was logged as a Decision (D23/D24/D25) and approved by you at the time via the phase-gate `AskUserQuestion`. They're flagged again here, explicitly, because this is a final acceptance review, not a re-confirmation of prior phase approvals — you should decide fresh whether each cut is still acceptable for Sprint 10 sign-off. See the QA Status Report (section 4) for the full list.

---

## 1. Browser walkthrough — open these pages in this order

Environment setup (ports, docker compose, `.env`) is in `SPRINT_10_ACCEPTANCE_CHECKLIST.md` section 2 — same stack, not repeated here. One prerequisite: there is no in-app signup screen, so create a test account first with:

```bash
curl -X POST http://localhost:4000/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"anshh@tradosphere.os","password":"a-real-password-8plus-chars"}'
```

Then, in the browser, in this exact order:

1. `http://localhost:3000/` — signed out, confirm redirect to `/login`
2. `http://localhost:3000/login` — sign in with the account above
3. `http://localhost:3000/dashboard` — Dashboard + Market Workspace (10.2)
4. `http://localhost:3000/research` — Research Workspace (10.3)
5. `http://localhost:3000/ai-council` — AI Council (10.3)
6. `http://localhost:3000/cio` — CIO Workspace (10.3)
7. `http://localhost:3000/paper-trading` — place at least one order here before continuing (10.4)
8. `http://localhost:3000/journal` — confirm the order from step 7 landed here (10.4)
9. `http://localhost:3000/portfolio` — confirm it reflects step 7 (10.4)
10. `http://localhost:3000/analytics` — record an outcome on the journal entry first if you want non-empty stats (10.4)
11. `http://localhost:3000/education` — all four tabs: Courses, Glossary, Strategies, Quizzes (10.5)
12. `http://localhost:3000/settings` (10.6)
13. `http://localhost:3000/search` (10.6)
14. Back to any page — do a full keyboard-only pass (Tab/Shift+Tab/Enter) and a light/dark theme toggle (10.1 + 10.6 accessibility)

Steps 7→10 are ordered deliberately: Paper Trading writes the data that Journal, Portfolio, and Analytics then display, so testing them in this order lets you verify real data flowing through rather than looking at empty screens.

---

## 2. Feature checklist by phase

### Sprint 10.1 — Foundation

**1. App Shell & Responsive Navigation**
- Route: all `/(app)/*` routes (persistent layout, not its own page)
- Expected behaviour: Sidebar nav on desktop, top bar + slide-over menu below 768px; active route highlighted; disabled items show a "Soon" badge.
- Backend API used: none directly (reads auth state for the header).
- Manual test steps: Load any app page wide → narrow the window below 768px → click Menu → click a nav link → check the active link marker.
- Expected result: Same nav content at every width, only the container changes; navigation actually moves you between pages.
- Possible failure cases: Sidebar and mobile menu show different item sets; active-page highlight doesn't update; "Soon" items are clickable or 404; content overflows/breaks below ~360px.

**2. Authentication (Login / Logout / Session Persistence)**
- Route: `/login`, `/` (redirect logic)
- Expected behaviour: Real login against the gateway; session persists across reloads; logout really clears it.
- Backend API used: `POST /v1/auth/login`, `GET /v1/auth/me`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`.
- Manual test steps: Try a wrong password → log in with the real account → reload the page → log out → reload again.
- Expected result: Wrong password shows a real error and blocks entry; correct login lands on `/dashboard` and survives a reload; logout sends you back to `/login` and a reload doesn't restore the session.
- Possible failure cases: Wrong password silently "succeeds"; session lost on reload (forces re-login every time); logout doesn't actually invalidate anything server-side (check Network tab for the real `POST /v1/auth/logout` call); **no in-app signup screen exists** — this matches the original 10.1 spec ("auth flow (login/session)" only, confirmed in `SPRINT_BOOK.md` line 242), so it is not a defect, but flag if you want it added for Sprint 11.

**3. Theme Toggle (Light / Dark)**
- Route: header (all pages), `/settings`
- Expected behaviour: Instant app-wide light/dark switch, persists across reloads.
- Backend API used: none — client-side only.
- Manual test steps: Toggle in the header → reload → toggle from Settings instead.
- Expected result: Whole app recolors instantly; choice survives reload; both toggle locations stay in sync.
- Possible failure cases: Some components don't pick up the theme (hardcoded colors); flash of wrong theme on load; toggle in Settings and header get out of sync.

---

### Sprint 10.2 — Dashboard + Market Workspace

**4. Dashboard & Market Workspace (Market Bar, CIO Verdict Panel, Expert Status Row)**
- Route: `/dashboard` (note: "Market Workspace" is the same route as "Dashboard" — confirmed via `nav-items.ts`, not a separate page)
- Expected behaviour: Live ticks over WebSocket; CIO verdict panel with 5 real states (loading / awaiting-verdict / active / stale / disconnected); expert status row.
- Backend API used: WebSocket `/v1/stream` (gateway) — no REST polling.
- Manual test steps: Load `/dashboard` → watch for live ticks and a verdict to arrive → stop the API gateway process → watch the panel → restart the gateway.
- Expected result: Ticks update live; verdict panel shows a real connecting/awaiting state before data, an active state once a verdict lands, and a disconnected state (not a frozen "last good" render) when the gateway dies; reconnects automatically when the gateway comes back.
- Possible failure cases: Panel freezes on stale data without labeling it as such when the connection drops; no visible difference between "no verdict yet" and "connection dead"; ticks stop updating without any visible indication; reconnection requires a manual page reload.

---

### Sprint 10.3 — Research + AI Council + CIO Workspace

**5. Research Workspace (Fundamentals Lookup)**
- Route: `/research`
- Expected behaviour: Symbol lookup returns real ingested fundamentals.
- Backend API used: `GET /v1/research/fundamentals/{symbol}`.
- Manual test steps: Search a known symbol → search a symbol with no data → search an invalid symbol.
- Expected result: Known symbol returns real numbers; unknown symbol shows an explicit "not found," not zeros or a blank screen; invalid input shows a real validation/API error.
- Possible failure cases: Blank screen instead of an empty-state message; fabricated/zeroed numbers presented as real data.
- **Spec-vs-delivered flag:** The original 10.3 row in `SPRINT_BOOK.md` (line 244) scoped a full "technical/options/sector/macro/risk/education breakdown" detail view. What's actually built is fundamentals-only, per Decision D24, because the other four disciplines need caller-supplied raw market data (bars, option chains) this frontend has no source for. This was approved at the 10.3 phase gate, but it means the *original* exit criterion in line 261 ("see full technical/options/sector/risk/education breakdown") is not met by what's on screen today — worth a fresh decision at final sign-off, not just noting it was previously agreed.

**6. AI Council (Per-Expert Verdict Breakdown)**
- Route: `/ai-council`
- Expected behaviour: Full breakdown of every expert's opinion behind the current streamed verdict.
- Backend API used: WebSocket `/v1/stream` (own connection, independent of Dashboard's).
- Manual test steps: Load before any verdict has streamed → wait for one → compare against Dashboard's verdict.
- Expected result: Explicit waiting state, then real per-expert rows once a verdict arrives; matches Dashboard's verdict content (may lag briefly right after a fresh page load since it's a separate connection).
- Possible failure cases: Expert rows show placeholder/fabricated data before a real verdict arrives; expert count/labels don't match what the backend actually sent.

**7. CIO Workspace (Verdict + Trade Ideas Feed + Tutor Explain)**
- Route: `/cio`
- Expected behaviour: Current verdict, a session-accumulated trade-ideas feed, and a real single-call "explain this verdict" tutor action.
- Backend API used: WebSocket `/v1/stream`; `POST /v1/education/tutor/explain`.
- Manual test steps: Load the page → watch trade ideas accumulate as verdicts stream in → click the tutor explain action → try it with no verdict yet available.
- Expected result: Feed only grows from real observed stream events (empty on a fresh page load, not backfilled with history); tutor explain returns a real explanation tied to the current verdict; disabled or explicit empty message if no verdict exists yet.
- Possible failure cases: Feed shows entries that weren't actually observed this session; tutor button does nothing or errors ungracefully with no verdict; tutor response looks generic/templated rather than tied to the actual verdict content.
- **Spec-vs-delivered flag:** Line 244 originally scoped an "AI chat/tutor workspace." What's built is one-shot explain, not a multi-turn chat — no chat endpoint exists in the backend (confirmed in Decision D24). Same as above: previously approved, re-flagging for a fresh final-review decision.

---

### Sprint 10.4 — Trading

**8. Paper Trading (Order Entry & Execution)**
- Route: `/paper-trading`
- Expected behaviour: Real order execution at the real latest tick price; explicit save-to-journal.
- Backend API used: `POST /v1/paper-trading/orders`.
- Manual test steps: Submit a valid order → submit an invalid one (bad symbol/qty) → submit while market-data service is stopped.
- Expected result: Valid order succeeds and appears in Journal; invalid order is rejected with a real validation message; no market price available produces a real error, never a guessed fill price.
- Possible failure cases: Fill price looks stale or fabricated; invalid orders silently accepted; double-submit creates duplicate orders.

**9. Trade Journal**
- Route: `/journal`
- Expected behaviour: Durable list of real trades; write-once outcome recording.
- Backend API used: `GET /v1/journal/entries`, `POST /v1/journal/entries/{id}/outcome`.
- Manual test steps: Confirm the order from step 8 appears → record an outcome → try recording a second outcome on the same entry.
- Expected result: Entry appears with correct details; outcome saves and displays; second attempt returns a real 409 conflict, not a silent overwrite.
- Possible failure cases: Entry from Paper Trading doesn't show up; outcome can be overwritten silently; empty state missing on a fresh account (looks broken instead of "no entries yet").

**10. Portfolio Dashboard**
- Route: `/portfolio`
- Expected behaviour: Real positions/cash/P&L/allocation/risk, with a client-side "Updated Xs/m ago" freshness note.
- Backend API used: Portfolio `summary()`.
- Manual test steps: View after the step-8 order → check the freshness note increments while the tab stays open → reload.
- Expected result: Figures match what you'd expect from the trade you placed; freshness note counts up, then resets to "just now" after reload.
- Possible failure cases: Numbers don't reconcile with the trade you placed; freshness note is missing, frozen, or mislabeled as a backend timestamp (it's actually a client fetch-time, not server "as-of" time — confirm the UI doesn't overstate its precision).

**11. Analytics Dashboard**
- Route: `/analytics`
- Expected behaviour: Real stats computed only from closed journal trades — win rate, avg return, drawdown, Sharpe/Sortino, expectancy, monthly/strategy/instrument/session breakdowns, heatmaps.
- Backend API used: Analytics `performance()` (superset `FullStatSet`).
- Manual test steps: View with zero closed trades → close a trade via journal outcome recording → view again.
- Expected result: Empty state (not misleading zeroed charts) with zero closed trades; real computed stats once at least one trade is closed.
- Possible failure cases: Charts render broken/empty with no explanation; stats that are mathematically meaningless at n=1 (e.g. Sharpe) are shown as if precise without caveat.

**12. Watchlist — NOT BUILT**
- Route: none — no page exists.
- Expected behaviour per original spec: `SPRINT_BOOK.md` line 245 originally scoped a Watchlist screen alongside Paper Trading/Portfolio/Journal/Analytics.
- Backend API used: N/A — no `/v1/watchlist*` route exists anywhere in the gateway or any backend service (confirmed by Decision D25's grep).
- Manual test steps: Check the nav for a Watchlist entry.
- Expected result: There isn't one — it was dropped from scope entirely (not even a disabled "Soon" placeholder, unlike Notifications) and logged as a future backend enhancement, approved by you at the 10.4 phase gate.
- Possible failure cases: N/A — listed here so it isn't silently missing from this review; confirm whether you still want it deferred or want it scoped into Sprint 11.

---

### Sprint 10.5 — Education Center

**13. Courses & Lessons**
- Route: `/education` (Courses tab, default)
- Expected behaviour: Real courses/lessons with progress tracking.
- Backend API used: `GET /v1/education/courses` + lesson/detail routes, `GET/PUT /v1/education/progress/{contentType}/{contentId}`, `GET /v1/education/categories`.
- Manual test steps: Browse courses → open one → mark progress → reload and confirm it persisted.
- Expected result: Real content and category labels; progress persists across reload.
- Possible failure cases: Progress doesn't save or resets on reload; category lookup failure blocks the whole tab instead of degrading gracefully.

**14. Glossary**
- Route: `/education` (Glossary tab)
- Expected behaviour: Real glossary terms/definitions.
- Backend API used: `GET /v1/education/glossary`.
- Manual test steps: Browse the tab; cross-check a term via the Search screen (Feature 19).
- Expected result: Real terms render; matches what Search finds for the same term.
- Possible failure cases: Empty/broken tab if the service returns zero terms; definitions truncated or overflowing.

**15. Strategies**
- Route: `/education` (Strategies tab)
- Expected behaviour: Real strategies with category/difficulty metadata.
- Backend API used: `GET /v1/education/strategies`.
- Manual test steps: Browse the tab; check a strategy with a missing category resolves gracefully.
- Expected result: Real strategies render; missing category degrades to no label rather than broken text.
- Possible failure cases: Broken card layout on a missing category; difficulty shown by color only with no text label.

**16. Quizzes (Interactive)**
- Route: `/education` (Quizzes tab)
- Expected behaviour: Real quiz-taking with real scoring and progress tracking.
- Backend API used: quiz listing/detail endpoints, `PUT /v1/education/progress/{contentType}/{contentId}`.
- Manual test steps: Take a full quiz, answer correctly and incorrectly on purpose → submit with a question left unanswered → check progress after finishing.
- Expected result: Score reflects your actual answers; unanswered questions are flagged, not silently scored; progress updates and persists.
- Possible failure cases: Score doesn't match your actual answers; unanswered questions counted as correct; retake behavior is unclear or loses your in-progress answers on a failed submit.

---

### Sprint 10.6 — Cross-cutting

**17. Settings Panel**
- Route: `/settings`
- Expected behaviour: Real account info (`GET /v1/auth/me`), theme control, explicit "not yet available" disclosure for profile edit/password change.
- Backend API used: `GET /v1/auth/me`, `POST /v1/auth/logout`.
- Manual test steps: Load and check email/role/id match your account → toggle theme → log out from this screen.
- Expected result: Real, live account data (not cached-forever); logout here behaves identically to the header's logout.
- Possible failure cases: Stale/cached account info after an email or role change elsewhere; logout doesn't actually clear the session; disclosure text missing (silently implies profile edit works when it doesn't).

**18. Global Search**
- Route: `/search`
- Expected behaviour: Federated real search across courses, glossary, strategies in parallel.
- Backend API used: `GET /v1/education/{courses,glossary,strategies}?search=`.
- Manual test steps: Search before typing → search a term with real matches in all three → search a nonsense term → check for quiz/lesson-search disclosure text.
- Expected result: Idle prompt before search; real results in all three sections for a matching term; "No matches." per section (not fabricated) for a non-matching term; disclosure that quizzes/lessons aren't searchable is visible.
- Possible failure cases: One section's failure blocks/breaks the other two; "No matches." shown even when a real match exists (broken query param); disclosure text missing or misleading.

**19. Accessibility Pass (cross-cutting)**
- Route: all pages (app-shell-level + per-screen)
- Expected behaviour per original spec: `SPRINT_BOOK.md` line 247's exit criterion says "automated accessibility check passes."
- Backend API used: none.
- Manual test steps: Tab through the app shell and 3–4 feature screens keyboard-only; check focus rings are visible everywhere; check contrast in both themes.
- Expected result: Skip-to-content link works; every interactive element shows a visible focus ring; no keyboard dead-ends.
- Possible failure cases: Any interactive element unreachable or invisible-when-focused via keyboard.
- **Spec-vs-delivered flag:** No automated accessibility test (axe-core or equivalent) is wired into this repo — only manual review was performed. The original exit criterion ("automated accessibility check passes") is **not met as literally written**; what exists instead is a manual pass. This is the most direct gap between the original written spec and what shipped — flagging prominently since it's a stated exit criterion, not just a nice-to-have.

**20. Data-Freshness Indicators (cross-cutting)**
- Route: `/portfolio`, `/analytics`, `/journal` (client-fetch-time notes); `/dashboard`, `/ai-council`, `/cio` (genuine STALE badge on the verdict panel)
- Expected behaviour: Every screen where data can go stale shows it — either a real STALE badge (verdict panel, backend-timing-based) or a client-side "Updated Xs/m ago" note (snapshot screens, since those endpoints return no server timestamp).
- Backend API used: none new — reuses each screen's existing fetch.
- Manual test steps: Manually stale the CIO verdict (leave the tab open past its staleness window) and confirm the STALE badge appears → check the freshness note on Portfolio/Analytics/Journal counts up over time.
- Expected result: STALE badge appears on the verdict panel when appropriate; freshness notes are visibly present and update.
- Possible failure cases: STALE badge never appears even when data is genuinely stale; freshness note frozen or missing on any of the three snapshot screens.

**21. Notifications — Deferred (not built)**
- Route: none — nav item has no `href`.
- Expected behaviour per original spec: line 247 scoped Notifications as part of 10.6.
- Backend API used: none — no notification concept exists anywhere in the backend (confirmed by grepping `openapi.yaml` and the SDK client).
- Manual test steps: Check the nav for "Notifications."
- Expected result: Shows a disabled "Soon" badge, not a link, not a fake inbox.
- Possible failure cases: N/A — listed for completeness since it was in the original 10.6 scope; confirm you're still comfortable deferring it.

---

## 3. Per-page manual checklist (quick-check version)

Print or copy this section while you test — check each box as you confirm it in the browser.

**`/login`**
- [ ] Wrong password shows a real error
- [ ] Correct login redirects to `/dashboard`
- [ ] Session survives a reload

**`/dashboard`**
- [ ] Live ticks update without reloading
- [ ] CIO verdict panel shows a real state (not frozen/fake) at every point — loading, active, stale, disconnected
- [ ] Expert status row matches the verdict panel

**`/research`**
- [ ] Known symbol returns real fundamentals
- [ ] Unknown symbol shows explicit empty state
- [ ] Invalid input shows a real error

**`/ai-council`**
- [ ] Explicit waiting state before first verdict
- [ ] Per-expert breakdown matches the verdict on `/dashboard`

**`/cio`**
- [ ] Trade-ideas feed only shows ideas from this session
- [ ] Tutor "explain" returns a real, verdict-specific explanation
- [ ] Tutor action handles "no verdict yet" gracefully

**`/paper-trading`**
- [ ] Valid order succeeds
- [ ] Invalid order (bad qty/symbol) rejected with a real message
- [ ] Order fill price looks real, not fabricated

**`/journal`**
- [ ] Order from Paper Trading appears here
- [ ] Outcome recording works once
- [ ] Recording a second outcome returns a real conflict, not a silent overwrite

**`/portfolio`**
- [ ] Positions/cash/P&L reconcile with the trade you placed
- [ ] Freshness note is present and counts up

**`/analytics`**
- [ ] Empty state before any closed trade
- [ ] Real stats after closing a trade
- [ ] Freshness note present

**`/education`**
- [ ] Courses tab: real content, progress persists across reload
- [ ] Glossary tab: real terms
- [ ] Strategies tab: real strategies
- [ ] Quizzes tab: score reflects real answers, progress updates

**`/settings`**
- [ ] Account info matches your real account
- [ ] Theme toggle works and stays in sync with the header
- [ ] Logout here works
- [ ] "Not yet available" disclosure visible for profile edit/password change

**`/search`**
- [ ] Idle prompt before typing
- [ ] Real results across all three sections for a matching term
- [ ] "No matches." per section for a non-matching term
- [ ] Quiz/lesson-search disclosure visible

**Cross-cutting**
- [ ] Full keyboard-only pass with no dead ends (Tab/Shift+Tab/Enter)
- [ ] Light/dark theme legible everywhere
- [ ] Nav shows "Notifications" and (confirm) no Watchlist item, both disabled/absent as expected

---

## 4. QA Status Report

**Completed** (built, matches its approved scope, verified against real backend calls during doc prep):
- App Shell & Responsive Navigation
- Authentication (Login/Logout/Session Persistence — signup UI was never in the original 10.1 scope, see below)
- Theme Toggle
- Dashboard & Market Workspace
- AI Council
- Paper Trading
- Trade Journal
- Portfolio Dashboard
- Analytics Dashboard
- Courses & Lessons, Glossary, Strategies, Quizzes
- Settings Panel
- Global Search
- Data-Freshness Indicators

**Partially Completed** (built, but narrower than the *original* SPRINT_BOOK phase-table scope — each was approved as a scope cut at its phase gate, re-flagged here for a fresh final decision):
- Research Workspace — fundamentals only, not the technical/options/sector/macro/risk breakdown originally scoped (Decision D24).
- CIO Workspace — single-call tutor explain, not the "AI chat/tutor workspace" originally scoped (Decision D24).
- Accessibility Pass — manual review only; the original exit criterion specifically said "automated accessibility check passes," which does not exist.

**Missing** (in original scope, not built at all):
- Watchlist (Sprint 10.4) — no route, no backend capability, dropped per Decision D25.
- Notifications (Sprint 10.6) — no route, no backend capability, deferred per explicit instruction not to mock one.
- In-app signup screen — not actually in original 10.1 scope (which said "login/session" only), so not a spec violation, but worth deciding whether it belongs in Sprint 11 since there's currently no way to create an account except a direct API call.

**Assumptions made during this review** (need your confirmation, not independently verified against a live server since one wasn't running while this document was prepared):
- Quiz retake policy (does retaking overwrite, block, or allow multiple attempts?) — not verified; confirm during your walkthrough.
- Whether Portfolio/Analytics/Journal preserve last-known-good data on a failed refetch, or show nothing — not verified; confirm during your walkthrough.
- Whether the CIO verdict panel's STALE threshold is tuned to a reasonable real-world duration — not independently re-measured this session.

**Deferred items** (explicitly out of scope, disclosed in-UI, not defects):
- Profile editing / password change (Settings)
- Quiz and individual-lesson search (Search)
- Notifications (entire feature)
- Watchlist (entire feature)
- In-app signup flow

**Technical debt:**
- No automated accessibility testing (axe-core or equivalent) in the toolchain — manual-only coverage.
- Freshness notes on Portfolio/Analytics/Journal are client-observed fetch times, not true backend "as-of" timestamps (those endpoints don't return one) — accurate but less precise than a real server timestamp would be.
- Trade-ideas feed (CIO Workspace) is session-only, in-memory — no persisted/queryable history endpoint exists.
- No in-app signup UI, so account creation currently requires a direct API call.

---

## 5. Approval gate

Nothing above is approved until you say so. Work through section 1's page order, use section 3's checklist live, and flag anything that fails against section 2's "Expected result" or matches a "Possible failure case." I will log every issue you raise in a bug list, categorized Critical/High/Medium/Low, and only fix genuine bugs — followed by a full re-run of build, lint, and tests after any fix.

When you're ready, tell me to start walking through page 1 (`/login`), or raise anything from the QA Status Report you want resolved differently before we begin. Sprint 11 does not start until you explicitly approve or reject Sprint 10 here.
