# Sprint 10 (Frontend) — Principal Acceptance Checklist

**Status:** Awaiting Principal manual verification. Nothing in this document constitutes sign-off — every checklist item requires Anshh's own hands-on confirmation.

**Role note:** This document was prepared acting as QA Lead / Release Manager, not as a developer. No functionality was added, changed, or "improved" while preparing it — every field below is a description of what was already built and verified in Sprints 10.1–10.6, cross-checked directly against the current source files. If a genuine bug is found during the walkthrough, it will be logged in the Bug Log at the end of this document, categorized by severity, and only then fixed — followed by a full re-run of build, lint, and tests.

---

## 1. How to use this document

1. Read "2. Environment setup" once and get a dev stack running.
2. Go through the 20 features below in order (they're grouped by phase, 10.1 → 10.6).
3. For each feature: follow "Manual testing steps," compare what you see against "Expected behaviour" / the state columns, and confirm out loud (or in chat) before moving to the next one. I will wait for your explicit confirmation at each feature — no auto-advancing.
4. Anything that doesn't match gets logged immediately in the Bug Log (section 4) with a severity. We keep walking the list; bugs don't block seeing the rest of the app.
5. At the end, section 5 is the sign-off gate — Sprint 10 is marked COMPLETE only when every row there is checked by you.

---

## 2. Environment setup

**Test account — read this first.** There is no signup screen in the frontend (`apps/web` has `/login` only, no `/signup` route — confirmed by directory listing). To get a test account, sign up directly against the auth service's real endpoint before you start:

```bash
curl -X POST http://localhost:4000/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"anshh@tradosphere.os","password":"a-real-password-8plus-chars"}'
```

This hits the real gateway → real `services/auth` → real Postgres `users` table (same code path `/login`'s form uses). The response includes an access/refresh token pair, but you don't need them — just go to `/login` in the browser afterward and sign in normally. This gap (no in-app signup UI) is logged as a known limitation under Feature 2 below, not silently fixed.

**Starting the stack:**

```bash
# 1. Infra (Postgres + Redis) + the five backend services that run standalone
docker compose up -d postgres redis auth market-data education portfolio analytics

# 2. The API gateway (apps/api) — the ONLY backend address the frontend talks to
pnpm --filter @tradosphere/api dev   # http://localhost:4000

# 3. The frontend
pnpm --filter web dev                 # http://localhost:3000
```

If you'd rather run everything through Docker Compose end-to-end, `docker compose up` brings up every service on the ports below. `apps/web` reads `NEXT_PUBLIC_API_BASE_URL` (defaults to `http://localhost:4000`) from `apps/web/.env.local` — copy it from `.env.example` if it's not already present.

| Service | Port |
|---|---|
| Postgres | 5432 |
| Redis | 6379 |
| API gateway (`apps/api`) | 4000 |
| Auth | 4001 |
| Market data | 4002 |
| Education | 4003 |
| Portfolio | 4004 |
| Analytics | 4005 |
| Web frontend | 3000 |

**Browser:** any evergreen browser is fine. For the responsive checks, use DevTools' device toolbar (or resize the window) rather than a second device — the breakpoint that matters is Tailwind's `md:` (768px).

**Accessibility checks:** each feature below lists a manual keyboard-only pass (Tab/Shift+Tab/Enter/Space, no mouse) plus a visual contrast/focus-ring check. No automated axe-based scanner is wired into this repo yet (logged as a Parked Item in `EXECUTION_BOOK.md`) — these are eyes-and-keyboard checks only.

---

## 3. Feature checklist

### Phase 10.1 — Foundation

#### 1. App Shell & Responsive Navigation

- **Purpose:** The persistent layout (sidebar/top bar/nav) every other screen renders inside — collapses to a top bar + slide-over below the `md:` breakpoint instead of a second layout.
- **Files changed:** `apps/web/src/components/app-shell.tsx`, `apps/web/src/components/nav-items.ts`, `apps/web/src/app/(app)/layout.tsx`
- **Backend API(s) used:** None directly — reads auth state from `useAuth()` (see Feature 2) to show the signed-in user's email/role and a Log out button.
- **Manual testing steps:**
  1. Load any `/(app)` route on a wide window (≥768px). Confirm a fixed left sidebar with all nav items.
  2. Narrow the window below 768px. Confirm the sidebar disappears and a "Menu" button + app name appear in a top bar instead.
  3. Click "Menu." Confirm a slide-over nav panel opens below the top bar; click a link and confirm it navigates and the panel closes.
  4. Click into the current page's nav item and confirm it's visually marked active (`aria-current="page"`).
  5. Look at "Notifications" in the nav — confirm it shows a "Soon" badge and is not clickable.
- **Expected behaviour:** Same nav content and same active-route highlighting at every width; only the presentation container changes.
- **Loading state:** N/A (static layout, no fetch of its own).
- **Empty state:** N/A.
- **Error state:** N/A.
- **Edge cases:** Signed-out user hitting an `(app)` route directly (should redirect to `/login` — see Feature 2's redirect logic, not the shell itself). Extremely narrow (<360px) viewport — check the top bar doesn't overflow/wrap awkwardly.
- **Responsive behaviour:** This *is* the responsive-behaviour feature — see steps 1–3 above. Also check the header's user email hides on very narrow widths (`sm:inline` on the email span) while the role badge and Log out button remain visible.
- **Accessibility checks:** Tab from a fresh page load — the very first focus stop should be an invisible "Skip to content" link; press Enter on it and confirm focus jumps straight to `<main>`, skipping the nav. Tab through every nav link, the Menu button, and Log out — each should show a visible focus ring (`focus-visible:outline-accent`). Confirm the mobile Menu button has `aria-expanded`/`aria-controls` that reflect its open/closed state (inspect via DevTools if needed).
- **Known limitations:** None beyond what's listed for auth/theme below.
- **Real backend data only:** Yes — the only dynamic content (user email/role) comes from the real `useAuth()` session.
- **Mocked/deferred/unavailable functionality:** "Notifications" nav item is a disabled placeholder — see Feature 20.

#### 2. Authentication (Login / Logout / Session Persistence)

- **Purpose:** Real email/password auth against the gateway, with session persistence across reloads and one automatic refresh-and-retry on an expired access token.
- **Files changed:** `apps/web/src/app/login/page.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/lib/auth-context.tsx`, `apps/web/src/lib/auth-actions.ts`, `apps/web/src/lib/token-store.ts`
- **Backend API(s) used:** `POST /v1/auth/login`, `GET /v1/auth/me`, `POST /v1/auth/refresh`, `POST /v1/auth/logout` (all real, proxied through the gateway to `services/auth`).
- **Manual testing steps:**
  1. Go to `http://localhost:3000/` signed out. Confirm it briefly shows "Loading Tradosphere OS…" then redirects to `/login`.
  2. Try logging in with a wrong password. Confirm a real error message renders (`role="alert"`) and you stay on `/login`.
  3. Log in with the account you created in section 2's curl command. Confirm redirect to `/dashboard` and your email/role appear in the header.
  4. Reload the page. Confirm you stay signed in (session persisted, not re-prompted for credentials).
  5. Click "Log out" in the header. Confirm redirect back to signed-out state and the session is gone (reload confirms you're sent to `/login`).
- **Expected behaviour:** Every state transition reflects a real network round trip — no client-side "looks logged in" shortcut.
- **Loading state:** Submit button reads "Signing in…" and is disabled while the login request is in flight; root `/` shows a "Loading Tradosphere OS…" status region while the session is being restored.
- **Empty state:** N/A (form-based feature).
- **Error state:** Wrong credentials or a network failure render a real inline error string from the gateway response, not a generic fallback.
- **Edge cases:** Expired access token mid-session — one silent refresh-and-retry happens automatically (verify by watching Network tab for a `POST /v1/auth/refresh` call after a long-idle period, if your token TTL is short enough to reproduce). Logging out with a network failure still clears the local session (best-effort logout, confirmed in `auth-actions.ts`).
- **Responsive behaviour:** Login form is centered and full-width up to a `max-w-sm` card at every viewport size — check it doesn't overflow on a narrow phone width.
- **Accessibility checks:** Tab through email → password → submit in order; both inputs have visible `<label>`s wired via `htmlFor`; the error message uses `role="alert"` so a screen reader announces it automatically.
- **Known limitations:** **No in-app signup screen exists.** New accounts must be created via a direct `POST /v1/auth/signup` call (curl, Postman, etc.) as shown in section 2 — there is no `/signup` route in `apps/web`. This is a real gap, not a bug introduced by this review; flag if you'd like it scoped for Sprint 11.
- **Real backend data only:** Yes.
- **Mocked/deferred/unavailable functionality:** None beyond the missing signup UI noted above.

#### 3. Theme Toggle (Light / Dark Mode)

- **Purpose:** User-controlled light/dark theme, available from both the header and Settings.
- **Files changed:** `apps/web/src/components/theme-toggle.tsx`, `apps/web/src/lib/theme-context.tsx`
- **Backend API(s) used:** None — client-side only (no backend concept of a theme preference exists).
- **Manual testing steps:**
  1. Click the theme toggle in the header. Confirm the whole app's colors flip (background, surface, borders, text).
  2. Reload the page. Confirm your last-chosen theme persists.
  3. Open Settings (`/settings`) and confirm the same toggle/control appears there and stays in sync with the header one.
- **Expected behaviour:** Instant, app-wide visual change; persists across reloads.
- **Loading state:** N/A.
- **Empty state:** N/A.
- **Error state:** N/A — purely client-side, nothing to fail.
- **Edge cases:** First-ever load with no stored preference — confirm it falls back to a sane default rather than an unstyled flash.
- **Responsive behaviour:** Toggle stays visible and tappable at every width, including the mobile top bar.
- **Accessibility checks:** Toggle is reachable by keyboard and has a visible focus ring; confirm it has an accessible name (not just an icon with no label — inspect via DevTools' Accessibility tab).
- **Known limitations:** Preference is stored client-side only (not synced server-side to the account, so it won't follow you to a different browser/device). This is expected — no backend field exists for it, and none was fabricated.
- **Real backend data only:** N/A — legitimately a client-only feature; nothing here fabricates backend data.
- **Mocked/deferred/unavailable functionality:** None.

---

### Phase 10.2 — Dashboard & Market Workspace

#### 4. Dashboard & Market Workspace (Live Market Bar, CIO Verdict Panel, Expert Status Row)

- **Purpose:** The landing screen after login — a live market ticker, the CIO's current verdict, and a compact per-expert status row, all sharing one WebSocket connection. Note: per `nav-items.ts`, "Market Workspace" and "Dashboard" are the same route/screen (`/dashboard`), not two separate pages — Anshh's original instruction didn't require a second route, so 10.2 built the live components directly into `/dashboard`.
- **Files changed:** `apps/web/src/app/(app)/dashboard/page.tsx`, `apps/web/src/components/market-bar.tsx`, `apps/web/src/components/cio-verdict-panel.tsx`, `apps/web/src/components/expert-status-row.tsx`, `apps/web/src/hooks/use-market-stream.ts`, `apps/web/src/lib/market-stream.ts`, `apps/web/src/lib/verdict-panel-state.ts`
- **Backend API(s) used:** WebSocket `/v1/stream` (real-time ticks + CIO verdicts) via the gateway — no REST polling.
- **Manual testing steps:**
  1. Load `/dashboard` and confirm the market bar starts showing live ticks for the configured symbols (default `RELIANCE,TCS,INFY` unless `MARKET_DATA_SYMBOLS` was changed).
  2. Watch the CIO Verdict Panel — confirm it starts in a loading/awaiting state and updates once a verdict streams in.
  3. Kill the API gateway process (`Ctrl+C` on its terminal) while the dashboard is open. Confirm the connection badge/panel reflects a disconnected state rather than freezing silently or showing fake data.
  4. Restart the gateway and confirm the dashboard reconnects and resumes live updates without a page reload.
  5. Leave the tab open and idle — after the verdict's staleness window elapses, confirm the panel shows a STALE badge rather than silently continuing to imply the old verdict is current.
- **Expected behaviour:** Panel state always reflects the real WebSocket connection status — five explicit states: loading, awaiting-verdict, active, stale, disconnected (per Decision D23).
- **Loading state:** "Connecting…"/loading indicator shown before the first tick or verdict arrives.
- **Empty state:** If no verdict has ever been emitted this session, the panel says so explicitly rather than rendering blank or fabricated numbers.
- **Error state:** A WebSocket drop shows a disconnected state, not a frozen "last known good" render presented as live.
- **Edge cases:** Reconnect after a drop; a verdict that arrives and then goes stale without a new one replacing it; very first page load before any stream data has arrived at all.
- **Responsive behaviour:** Market bar symbols wrap/scroll sensibly on narrow widths rather than overflowing; verdict panel and expert row stack vertically below `md:`.
- **Accessibility checks:** Confirm live-updating regions (ticks, verdict state) don't spam a screen reader on every tick — check for appropriate `aria-live` scoping (e.g., only the verdict state changes are announced, not every price tick). Keyboard focus order through the page is logical.
- **Known limitations:** CIO Verdict Panel is WebSocket-observation-only — it shows whatever verdict the stream has actually emitted; it cannot be triggered/refreshed on demand from this screen (matches the real backend's push-only model, no polling fallback endpoint exists).
- **Real backend data only:** Yes — ticks and verdicts come only from the live stream; nothing is interpolated or fabricated between messages.
- **Mocked/deferred/unavailable functionality:** None on this screen.

---

### Phase 10.3 — Research + AI Council + CIO Workspace

#### 5. Research Workspace (Fundamentals Lookup)

- **Purpose:** Look up a symbol's already-ingested fundamentals.
- **Files changed:** `apps/web/src/app/(app)/research/page.tsx`, `apps/web/src/components/research-lookup.tsx`
- **Backend API(s) used:** `GET /v1/research/fundamentals/{symbol}`
- **Manual testing steps:**
  1. Go to `/research`, enter a symbol you know has data (e.g. one of the configured market-data symbols), submit.
  2. Confirm real fundamentals render (not placeholder numbers).
  3. Enter a symbol with no ingested fundamentals. Confirm an explicit "not found"/empty message, not a blank screen or zeros.
  4. Enter an invalid/malformed symbol. Confirm a real error message from the API, not a silent failure.
- **Expected behaviour:** Every result reflects the real `fundamentals` table row for that symbol; nothing is computed client-side.
- **Loading state:** Visible spinner/loading text while the lookup is in flight.
- **Empty state:** Explicit "no fundamentals found for this symbol" message.
- **Error state:** Real API error message surfaced (e.g. 404 vs 400 vs 500 distinguished, not collapsed into one generic string).
- **Edge cases:** Symbol casing (lowercase input for an uppercase-stored symbol), leading/trailing whitespace, empty submit.
- **Responsive behaviour:** Form and result layout remain usable on narrow widths (fields stack, no horizontal scroll needed).
- **Accessibility checks:** Input has a real label; submit is reachable via Enter key, not mouse-only; loading/error states are announced (check for `role="status"`/`role="alert"`).
- **Known limitations:** Scoped to exactly what the gateway exposes as a read (Decision D24) — the other four research disciplines (technical, options, sector, quant) require caller-supplied raw market data this app has no source for, so they were deliberately not built rather than faked.
- **Real backend data only:** Yes.
- **Mocked/deferred/unavailable functionality:** Technical/options/sector/quant research disciplines — not built (see Known limitations).

#### 6. AI Council (Per-Expert Verdict Breakdown)

- **Purpose:** Full expert-by-expert breakdown of whatever CIO verdict has actually arrived on this page's own stream connection.
- **Files changed:** `apps/web/src/app/(app)/ai-council/page.tsx`, `apps/web/src/components/ai-council-detail.tsx`, `apps/web/src/lib/expert-labels.ts`
- **Backend API(s) used:** WebSocket `/v1/stream` (same verdict stream as Dashboard, independent connection per page mount).
- **Manual testing steps:**
  1. Go to `/ai-council` before any verdict has streamed in this session. Confirm an explicit awaiting/loading state, not blank experts.
  2. Wait for a verdict. Confirm each expert's individual opinion/score renders, labeled correctly (cross-check against `expert-labels.ts`'s mapping).
  3. Compare the overall verdict shown here against the one on `/dashboard` — they should agree if received around the same time (each page holds its own independent connection, so a brief mismatch during a fresh reconnect is expected, not a bug).
- **Expected behaviour:** One row/card per real expert in the CIO ensemble, all sourced from the same verdict payload — no expert row is synthesized if the backend didn't include it.
- **Loading state:** Explicit "waiting for a verdict" state before the first one arrives on this page's connection.
- **Empty state:** Same as loading if the stream never emits a verdict during the session.
- **Error state:** Disconnected-stream state, distinguished from "no verdict yet."
- **Edge cases:** Reconnect mid-session; a verdict with fewer experts represented than usual (should still render only what's present, not pad with placeholders).
- **Responsive behaviour:** Expert cards/rows stack cleanly on narrow widths.
- **Accessibility checks:** Expert list is real semantic markup (list or headed sections, not divs with no structure); state changes are announced appropriately, not silently.
- **Known limitations:** Independent stream connection per page — navigating here fresh always starts from "awaiting verdict" even if Dashboard already has one, until this page's own connection receives its first message.
- **Real backend data only:** Yes.
- **Mocked/deferred/unavailable functionality:** None.

#### 7. CIO Workspace (Verdict + Trade Ideas Feed + Tutor Explain)

- **Purpose:** One screen combining the current verdict (reusing the same panel as Dashboard), a feed of every trade idea actually observed this session, and a real "explain this verdict" AI tutor action.
- **Files changed:** `apps/web/src/app/(app)/cio/page.tsx`, `apps/web/src/components/trade-ideas-feed.tsx`, `apps/web/src/components/tutor-explain-panel.tsx`
- **Backend API(s) used:** WebSocket `/v1/stream` (verdict + trade-idea history), plus a real tutor-explain endpoint (single-call, not a chat) reusing the AI Council's Education agent.
- **Manual testing steps:**
  1. Go to `/cio`. Confirm the verdict panel matches Feature 4/6's behavior.
  2. Watch for trade ideas to accumulate in the feed as verdicts stream in — confirm each entry reflects a real observed verdict, not a fabricated running total.
  3. Click "explain this verdict" (or equivalent tutor action). Confirm a real explanation renders after a loading state, sourced from the actual current verdict.
  4. Try the tutor action with no verdict yet available. Confirm it's disabled or shows an explicit "nothing to explain yet" message rather than erroring or calling with empty data.
- **Expected behaviour:** Trade-ideas feed only ever grows from real stream events observed during this session (page refresh clears it — there's no persisted history endpoint for it); tutor explanation is a single real request/response, not a chat thread.
- **Loading state:** Feed shows "waiting for the first idea" before any arrive; tutor panel shows a loading state while its explain call is in flight.
- **Empty state:** Feed explicitly empty-state message if the session hasn't produced any ideas yet.
- **Error state:** Tutor call failure shows a real error message, not a fabricated fallback explanation.
- **Edge cases:** Rapid verdict changes (feed should append, not skip/overwrite entries); requesting an explanation right as the underlying verdict changes.
- **Responsive behaviour:** Three sections (verdict/feed/tutor) stack vertically on narrow widths in a sensible reading order.
- **Accessibility checks:** Tutor explain button reachable by keyboard, labeled clearly (not just an icon); feed entries are in a real list structure.
- **Known limitations:** Trade-ideas feed is session-scoped only (in-memory from the stream), not a persisted/queryable history — there's no backend endpoint for "past trade ideas" independent of the live stream. Tutor is single-call explain, not an open-ended chat interface.
- **Real backend data only:** Yes.
- **Mocked/deferred/unavailable functionality:** No persisted trade-idea history; no multi-turn tutor chat.

---

### Phase 10.4 — Trading

#### 8. Paper Trading (Order Entry & Execution)

- **Purpose:** Place a real paper order against the latest recorded market price.
- **Files changed:** `apps/web/src/app/(app)/paper-trading/page.tsx`, `apps/web/src/components/order-form.tsx`
- **Backend API(s) used:** `POST /v1/paper-trading/orders`, plus a save-to-journal round trip.
- **Manual testing steps:**
  1. Go to `/paper-trading`, fill in a valid order (symbol, side, quantity), submit.
  2. Confirm a real success confirmation, then check `/journal` to confirm the order actually landed there.
  3. Submit an order for an unrecognized symbol or invalid quantity (0, negative). Confirm real validation errors, not a silent no-op or a fake success.
  4. Submit an order while the market-data service is down (stop it in Docker). Confirm a real error surfaces rather than a fabricated fill price.
- **Expected behaviour:** Execution price is the latest real recorded price at submit time — never a client-guessed or stale-but-labeled-as-fresh number.
- **Loading state:** Submit button shows a busy state while the order request is in flight.
- **Empty state:** N/A (form-based).
- **Error state:** Distinct messages for validation failure (400) vs. no market price available vs. server error.
- **Edge cases:** Submitting twice quickly (double-submit protection); a symbol with a very stale last-known price (should this be flagged as stale? verify against what the panel actually shows).
- **Responsive behaviour:** Form fields stack cleanly on narrow widths; inputs remain reachable and not clipped.
- **Accessibility checks:** All fields have real labels; validation errors are associated with their field (`aria-describedby` or adjacent visible text) and/or announced via `role="alert"`.
- **Known limitations:** Paper trading only — no live broker execution path exists in this UI (by design, matches backend scope).
- **Real backend data only:** Yes.
- **Mocked/deferred/unavailable functionality:** None beyond the paper-only scope, which is intentional platform scope, not a gap.

#### 9. Trade Journal

- **Purpose:** The durable record of every real paper trade, plus recording a trade's real outcome.
- **Files changed:** `apps/web/src/app/(app)/journal/page.tsx`, `apps/web/src/components/journal-list.tsx`
- **Backend API(s) used:** `GET /v1/journal/entries`, `POST /v1/journal/entries/{id}/outcome`
- **Manual testing steps:**
  1. Go to `/journal` after placing at least one order (Feature 8). Confirm it appears with correct details.
  2. Record an outcome for an open entry. Confirm it saves and reflects immediately.
  3. Try recording a second outcome for the same entry. Confirm a real 409 conflict is surfaced (write-once server-side), not a silent overwrite.
  4. With zero trades ever placed on a fresh account, confirm an explicit empty state.
- **Expected behaviour:** List always reflects the real `GET /v1/journal/entries` response; outcome recording is a real, idempotency-guarded write.
- **Loading state:** Visible loading indicator on first fetch.
- **Empty state:** Explicit "no journal entries yet" message for a fresh account.
- **Error state:** Real error message on fetch failure; real 409-specific message when re-recording an outcome (not a generic error).
- **Edge cases:** Very long entry lists (check pagination or scroll behavior, if any); an entry with a missing/partial outcome.
- **Responsive behaviour:** Table/list collapses to a stacked card layout (or equivalent) on narrow widths rather than forcing horizontal scroll of a wide table.
- **Accessibility checks:** If rendered as a table, confirm real `<th>`/scope usage; outcome-recording controls are keyboard-reachable and labeled.
- **Known limitations:** Outcome is write-once by server design — this is a deliberate backend constraint being honestly surfaced, not a UI bug.
- **Real backend data only:** Yes.
- **Mocked/deferred/unavailable functionality:** None.

#### 10. Portfolio Dashboard

- **Purpose:** Real positions, cash, P&L, allocation, and risk from the paper account.
- **Files changed:** `apps/web/src/app/(app)/portfolio/page.tsx`, `apps/web/src/components/portfolio-dashboard.tsx`, `apps/web/src/components/freshness-note.tsx`
- **Backend API(s) used:** Portfolio `summary()` (a superset call — positions/cash/P&L are not fetched as separate requests since summary already returns them).
- **Manual testing steps:**
  1. Go to `/portfolio` on an account with at least one filled paper order. Confirm holdings, cash, and P&L all reflect real figures consistent with what you did in Feature 8.
  2. Confirm a "Updated Xs/m ago" freshness note is visible and its time increases as you leave the tab open (it's computed from real fetch-completion time, not a backend timestamp).
  3. Reload — confirm the freshness note resets to "just now" after the fresh fetch.
  4. On a brand-new account with zero trades, confirm an explicit empty/zero state, not blank sections or a crash.
- **Expected behaviour:** Every figure traces back to the real `summary()` response; allocation/risk breakdowns sum sensibly against the totals shown.
- **Loading state:** Visible loading indicator before the first `summary()` response.
- **Empty state:** Zero-holdings account shows explicit "no positions yet" rather than an empty table with no explanation.
- **Error state:** Real error message if the portfolio service call fails.
- **Edge cases:** Positions with zero or negative P&L; an account with only cash and no positions.
- **Responsive behaviour:** Multiple stat sections stack cleanly on narrow widths.
- **Accessibility checks:** Numeric figures have clear labels (not just bare numbers with ambiguous meaning); freshness note text is real text (`role="status"`), not conveyed by color alone.
- **Known limitations:** Freshness note shows client-observed fetch time, not a backend "as-of" timestamp, since the underlying endpoint doesn't return one — documented deliberately rather than fabricating a backend timestamp.
- **Real backend data only:** Yes.
- **Mocked/deferred/unavailable functionality:** None.

#### 11. Analytics Dashboard

- **Purpose:** Real stats computed from the journal's closed trades — win rate, average return, risk/reward, drawdown, Sharpe/Sortino, expectancy, monthly reports, strategy/session/instrument breakdowns, heatmaps.
- **Files changed:** `apps/web/src/app/(app)/analytics/page.tsx`, `apps/web/src/components/analytics-dashboard.tsx`
- **Backend API(s) used:** Analytics `performance()` (superset call returning a `FullStatSet` — the six single-metric endpoints are not called separately).
- **Manual testing steps:**
  1. Go to `/analytics` on an account with at least one *closed* trade (an outcome recorded per Feature 9 — open-only trades won't populate most stats). Confirm real numbers render for win rate, avg return, drawdown, Sharpe/Sortino, expectancy.
  2. Confirm the freshness note here too, same behavior as Feature 10.
  3. On an account with zero closed trades, confirm an explicit empty state (not zeros presented as if they were meaningful computed stats, and not a broken chart).
  4. Check the heatmap/breakdown sections render sensibly with only one or two data points (not a broken/degenerate chart).
- **Expected behaviour:** All stats trace back to real closed journal entries — nothing is estimated or interpolated for missing data.
- **Loading state:** Visible loading indicator before the first `performance()` response.
- **Empty state:** Explicit "not enough closed trades yet" (or equivalent) rather than misleading zeroed-out charts.
- **Error state:** Real error message on fetch failure.
- **Edge cases:** Exactly one closed trade (some stats like Sharpe are undefined/meaningless with n=1 — confirm the UI handles this honestly rather than showing a nonsensical number); a month with zero trades in the monthly report.
- **Responsive behaviour:** Charts and stat grids reflow sensibly on narrow widths — check heatmaps in particular don't get clipped.
- **Accessibility checks:** Charts have a text-accessible fallback or adjacent data table/labels (not color-only conveyance of meaning); section headings are real headings for screen-reader navigation.
- **Known limitations:** Stats with well-known small-sample instability (Sharpe/Sortino with very few trades) are computed the same as the backend computes them — no client-side "not enough data, hiding this" heuristic beyond what the backend itself signals.
- **Real backend data only:** Yes.
- **Mocked/deferred/unavailable functionality:** None.

---

### Phase 10.5 — Education Center

#### 12. Courses & Lessons

- **Purpose:** Browse real courses and their lessons, track progress.
- **Files changed:** `apps/web/src/components/education-center.tsx`, `apps/web/src/components/course-library.tsx`
- **Backend API(s) used:** `GET /v1/education/courses`, course detail/lessons endpoints, `GET/PUT /v1/education/progress/{contentType}/{contentId}`, `GET /v1/education/categories`.
- **Manual testing steps:**
  1. Go to `/education`, confirm "Courses" is the default tab. Confirm real courses render with category labels.
  2. Open a course, confirm real lessons render.
  3. Mark a lesson/course as in-progress or complete. Confirm it persists (reload, revisit — progress should still show).
  4. Search for a course by title using the header Search (Feature 19) and confirm it links back correctly here.
- **Expected behaviour:** Course/lesson content and progress state both come from real endpoints; marking progress is a real idempotent `PUT`.
- **Loading state:** Visible loading indicator while courses/categories/progress fetch.
- **Empty state:** If the education service has zero courses, an explicit empty message (not a blank tab).
- **Error state:** If category-name lookup fails, cards render without the category label rather than blocking the whole tab (confirmed graceful-degradation behavior in `education-center.tsx`); if progress lookup fails, an explicit progress-error message is shown separately from the course list itself.
- **Edge cases:** A course with zero lessons; a lesson with no prior progress record.
- **Responsive behaviour:** Course cards reflow into a single column on narrow widths.
- **Accessibility checks:** Tab switching (Courses/Glossary/Strategies/Quizzes) is keyboard-operable and communicates the selected tab to assistive tech (`aria-selected`/`role="tab"` or equivalent — verify in DevTools).
- **Known limitations:** Progress and categories are fetched once at the Education Center level and shared down, not per-tab — switching tabs won't show newer progress from another browser tab/session without a full reload.
- **Real backend data only:** Yes.
- **Mocked/deferred/unavailable functionality:** None for this tab; cross-course lesson search is out of scope (see Feature 19).

#### 13. Glossary

- **Purpose:** Browse real glossary terms/definitions.
- **Files changed:** `apps/web/src/components/glossary-library.tsx`
- **Backend API(s) used:** `GET /v1/education/glossary`
- **Manual testing steps:**
  1. Go to the Glossary tab, confirm real terms/definitions render.
  2. Use the header Search (Feature 19) for a known term and confirm it appears in the Glossary results section.
- **Expected behaviour:** List reflects the real glossary table exactly.
- **Loading state:** Visible loading indicator on first fetch.
- **Empty state:** Explicit empty message if the service returns zero terms.
- **Error state:** Real error message on fetch failure.
- **Edge cases:** Very long definitions (check text wrapping/truncation behavior); terms with special characters.
- **Responsive behaviour:** List/grid reflows to single column on narrow widths.
- **Accessibility checks:** Terms are real semantic list/definition markup where applicable; readable contrast in both themes (spot-check against Feature 3).
- **Known limitations:** No glossary-specific search field on this tab itself — search happens via the global Search screen (Feature 19), not an in-tab filter box.
- **Real backend data only:** Yes.
- **Mocked/deferred/unavailable functionality:** None.

#### 14. Strategies

- **Purpose:** Browse real trading strategies.
- **Files changed:** `apps/web/src/components/strategy-library.tsx`
- **Backend API(s) used:** `GET /v1/education/strategies`
- **Manual testing steps:**
  1. Go to the Strategies tab, confirm real strategies render with category/difficulty labels.
  2. Use header Search (Feature 19) for a known strategy name and confirm it surfaces correctly.
- **Expected behaviour:** List reflects the real strategies table exactly, including difficulty/category metadata.
- **Loading state:** Visible loading indicator on first fetch.
- **Empty state:** Explicit empty message if zero strategies exist.
- **Error state:** Real error message on fetch failure.
- **Edge cases:** A strategy with a missing/unrecognized categoryId (should degrade gracefully, same pattern as Courses).
- **Responsive behaviour:** Cards/list reflow to single column on narrow widths.
- **Accessibility checks:** Difficulty/category badges aren't color-only indicators — check they have accompanying text.
- **Known limitations:** Same as Glossary — no in-tab filter box, search lives on the global Search screen.
- **Real backend data only:** Yes.
- **Mocked/deferred/unavailable functionality:** None.

#### 15. Quizzes (Interactive)

- **Purpose:** Take real quizzes and have progress/results tracked.
- **Files changed:** `apps/web/src/components/quiz-library.tsx`, `apps/web/src/components/progress-control.tsx`
- **Backend API(s) used:** Quiz listing/detail endpoints, `PUT /v1/education/progress/{contentType}/{contentId}` for completion tracking.
- **Manual testing steps:**
  1. Go to the Quizzes tab, open a quiz, answer all questions, submit.
  2. Confirm a real score/result renders based on your actual answers (change an answer and confirm the score changes accordingly on a retake, if retakes are allowed).
  3. Confirm the quiz's progress marker updates (visible in the Courses tab's progress indicators if the quiz is tied to a course, or wherever progress is surfaced).
  4. Try submitting with unanswered questions. Confirm real validation (should not silently score unanswered items as correct or wrong without telling you).
- **Expected behaviour:** Score is computed from your real submitted answers against the real correct-answer data; nothing is pre-filled or faked.
- **Loading state:** Visible loading indicator while quiz questions fetch.
- **Empty state:** Explicit empty message if zero quizzes exist.
- **Error state:** Real error on submit failure — your answers shouldn't silently vanish if a submit call fails (verify whether the UI preserves your selections on error).
- **Edge cases:** A quiz with a single question; retaking a quiz you already completed (confirm expected behavior — does it overwrite, block, or allow multiple attempts?).
- **Responsive behaviour:** Question/answer layout stays usable on narrow widths, including any multi-choice or matching-style questions.
- **Accessibility checks:** Answer options are real radio/checkbox inputs (not divs styled to look clickable) with labels; submit is keyboard-reachable; results are announced, not just visually indicated.
- **Known limitations:** Note whatever retake policy you observe in step 4 above here after testing — not independently verified as part of this document's preparation.
- **Real backend data only:** Yes.
- **Mocked/deferred/unavailable functionality:** None known — confirm during the walkthrough.

---

### Phase 10.6 — Cross-cutting

#### 16. Settings Panel

- **Purpose:** Real account info display and theme control.
- **Files changed:** `apps/web/src/app/(app)/settings/page.tsx`, `apps/web/src/components/settings-panel.tsx`
- **Backend API(s) used:** `GET /v1/auth/me`, `POST /v1/auth/logout`
- **Manual testing steps:**
  1. Go to `/settings`. Confirm your real email, role, and id render (matches what a direct `GET /v1/auth/me` call with your token would return).
  2. Confirm the theme toggle is present and works (same as Feature 3).
  3. Confirm a "Not yet available" disclosure is visible for settings that don't exist yet (profile editing, password change — see Known limitations).
  4. Click "Log out" from this screen. Confirm a real `POST /v1/auth/logout` call fires (check Network tab) and your local session clears.
- **Expected behaviour:** Account fields are a real, live `GET /v1/auth/me` round trip on every visit — not cached-forever local data.
- **Loading state:** Visible loading indicator before the account fetch resolves.
- **Empty state:** N/A (a signed-in user always has an account to show; this screen isn't reachable signed-out).
- **Error state:** Real error message if `GET /v1/auth/me` fails.
- **Edge cases:** Visiting immediately after a token refresh; logging out from Settings vs. from the header (should behave identically).
- **Responsive behaviour:** Panel content stacks cleanly on narrow widths.
- **Accessibility checks:** Log out button and theme toggle both keyboard-reachable with visible focus rings; account info is in readable text, not solely icon-conveyed.
- **Known limitations:** No profile editing (display name, avatar) and no password-change flow — both explicitly out of scope, disclosed in-UI as "Not yet available" rather than silently missing. No settings are actually persisted server-side by this screen beyond the existing session/logout mechanics.
- **Real backend data only:** Yes.
- **Mocked/deferred/unavailable functionality:** Profile editing, password change — both deferred and disclosed.

#### 17. Global Search

- **Purpose:** One search box that federates real search across courses, glossary, and strategies.
- **Files changed:** `apps/web/src/app/(app)/search/page.tsx`, `apps/web/src/components/global-search.tsx`
- **Backend API(s) used:** `GET /v1/education/courses?search=`, `GET /v1/education/glossary?search=`, `GET /v1/education/strategies?search=` (all three real, in parallel).
- **Manual testing steps:**
  1. Go to `/search` before typing anything. Confirm all three sections show "Enter a search term above."
  2. Search a term you know matches something in all three content types (e.g. "delta"). Confirm real results render in all three sections, sourced from three real parallel requests (check Network tab for all three `?search=` calls).
  3. Search a nonsense term with no matches. Confirm each section shows "No matches." individually — never a fabricated result.
  4. Confirm the on-screen disclosure that quizzes and individual lessons aren't searchable yet is visible.
- **Expected behaviour:** Each of the three sections resolves independently — one section's results/failure never blocks or fakes another's.
- **Loading state:** Each section shows its own loading state independently (they may resolve at different times — don't expect all three simultaneously).
- **Empty state:** Explicit idle prompt before any search ("Enter a search term above."), and explicit "No matches." after a real zero-result search — these are two distinct states, not conflated.
- **Error state:** If one content type's search request fails, that section shows a real error while the other two continue to show their own real results.
- **Edge cases:** Very short search terms (1 character); special characters/whitespace-only input; extremely long input.
- **Responsive behaviour:** Three result sections stack vertically on narrow widths.
- **Accessibility checks:** Search input has a real accessible label ("Search courses, glossary, and strategies"); the Search button is a real `<button>` reachable by keyboard; each section has a heading for screen-reader navigation.
- **Known limitations:** Quizzes and individual lessons are not searchable — the backend has no `search` query param on those routes and no cross-course lesson search route (confirmed against `openapi.yaml`/SDK types), so this was disclosed rather than faked with a client-side substring filter over partial data.
- **Real backend data only:** Yes.
- **Mocked/deferred/unavailable functionality:** Quiz search, individual-lesson search — both unavailable and disclosed in-UI.

#### 18. Accessibility Pass (cross-cutting)

- **Purpose:** A baseline keyboard/ARIA/contrast pass applied across the app, not a single screen.
- **Files changed:** `apps/web/src/components/app-shell.tsx` (skip-to-content link; focus-visible outlines added to nav links, mobile menu toggle, header logout button; `<main>` given `id="main-content"`/`tabIndex={-1}`), plus the pre-existing `focus-visible:outline-accent` convention already present in `theme-toggle.tsx` and most interactive elements across the other screens listed above.
- **Backend API(s) used:** None — purely frontend markup/CSS.
- **Manual testing steps:**
  1. From any page, load fresh and press Tab once. Confirm the "Skip to content" link appears and, on Enter, moves focus into `<main>`.
  2. Tab through the entire app shell (nav, menu toggle, theme toggle, logout) and confirm every interactive element shows a visible focus ring.
  3. Spot-check 3–4 of the feature screens above the same way (Dashboard, Paper Trading, Settings, Education) — confirm form fields, buttons, and tabs all show focus rings and are operable via keyboard alone (no mouse).
  4. Toggle dark/light theme and check text/background contrast is legible in both.
- **Expected behaviour:** No interactive element is a keyboard dead-end; focus is always visually indicated.
- **Loading state:** N/A.
- **Empty state:** N/A.
- **Error state:** N/A.
- **Edge cases:** Modal-like elements (mobile nav slide-over) — confirm focus doesn't get lost/trapped incorrectly when opening/closing.
- **Responsive behaviour:** Already covered per-feature above; this item is about interaction method (keyboard), not viewport size.
- **Accessibility checks:** This entire feature *is* the accessibility check — see manual testing steps.
- **Known limitations:** **No automated accessibility test (e.g. axe-core) is wired into this repo's toolchain** — everything here was verified by manual keyboard/visual review only, not a CI-enforced check. Logged as a Parked Item for a future sprint decision (Anshh to decide if in scope for Sprint 11+). A full WCAG audit (screen-reader-specific behavior beyond ARIA attributes, color-blindness simulation, etc.) has not been performed.
- **Real backend data only:** N/A.
- **Mocked/deferred/unavailable functionality:** Automated accessibility testing — deferred, not built.

#### 19. Data-Freshness Indicators (cross-cutting)

- **Purpose:** Make it visible when on-demand snapshot data (as opposed to live-streamed data) was last fetched, without inventing a staleness threshold the backend has no real concept of.
- **Files changed:** `apps/web/src/components/freshness-note.tsx`, `apps/web/src/lib/format-age.ts`, wired into `portfolio-dashboard.tsx`, `analytics-dashboard.tsx`, `journal-list.tsx`.
- **Backend API(s) used:** None directly — `atMs` is the real `Date.now()` captured client-side the moment each section's own fetch resolved, since none of the underlying endpoints (`summary()`, `performance()`, journal list, etc.) return a server timestamp.
- **Manual testing steps:**
  1. Load Portfolio, Analytics, and Journal in turn. Confirm each shows an "Updated Xs/m ago" note.
  2. Leave one open and watch the note's value increase over time without a reload.
  3. Reload the page and confirm the note resets to "just now."
  4. Compare this against the CIO Verdict Panel (Feature 4) — confirm that one instead shows a genuine STALE badge (a different, backend-timing-based mechanism, not this same client-fetch-time note), since the two are deliberately different indicators for deliberately different kinds of data (streamed vs. on-demand snapshot).
- **Expected behaviour:** The note always reflects real client-side fetch-completion time; it is never a fabricated or backend-sourced "last updated" field (none of these endpoints provide one).
- **Loading state:** No note shown until the first fetch actually resolves.
- **Empty state:** N/A.
- **Error state:** No note shown (or a stale one from a prior successful fetch, if the section keeps showing last-known-good data — verify which during the walkthrough) if a refetch fails.
- **Edge cases:** Very long idle periods (does "ago" formatting scale sensibly from seconds → minutes → hours?).
- **Responsive behaviour:** Note text remains visible and doesn't get clipped at narrow widths.
- **Accessibility checks:** Note uses `role="status"` so its value is announced when it first appears (not on every re-render/tick, which would be noisy — verify this isn't spamming a screen reader every second).
- **Known limitations:** This is a client-observed timestamp, not a true backend "as-of" time — if the underlying data was cached upstream before your fetch even reached this client, the note would understate true staleness. Documented as an honest limitation rather than a false precision claim.
- **Real backend data only:** N/A for the timestamp itself (client-side by design, disclosed); the underlying data it's attached to is always real.
- **Mocked/deferred/unavailable functionality:** None.

#### 20. Notifications — Deferred (not built)

- **Purpose:** N/A — no notification feature exists in this release.
- **Files changed:** None (the only trace is the disabled "Soon" nav item in `apps/web/src/components/nav-items.ts`).
- **Backend API(s) used:** None — confirmed no notification concept exists anywhere in the backend (no route, no table, no event stream shaped like a notification), verified by grepping `openapi.yaml` and `packages/sdk/src/client.ts` before this decision was made.
- **Manual testing steps:**
  1. Look at the nav. Confirm "Notifications" shows a "Soon" badge and is not a clickable link (no href, no route to click into, no 404).
  2. Confirm no other part of the app (toasts, badges, an inbox icon) implies a notification system exists.
- **Expected behaviour:** A clearly disabled, honestly labeled placeholder — never a fake/empty notification center pretending to be functional.
- **Loading state:** N/A.
- **Empty state:** N/A.
- **Error state:** N/A.
- **Edge cases:** N/A.
- **Responsive behaviour:** The "Soon" badge renders correctly at every width (part of Feature 1's nav).
- **Accessibility checks:** The disabled nav item uses `aria-disabled="true"` rather than being a dead link or a real interactive element with no effect.
- **Known limitations:** This is a full backend + frontend gap, not a UI-only deferral — building it for real would require a new backend service/table/event stream, none of which exists yet. Logged as a Parked Item in `EXECUTION_BOOK.md` for a future sprint.
- **Real backend data only:** N/A — nothing is rendered for this feature.
- **Mocked/deferred/unavailable functionality:** The entire feature. Per Anshh's standing instruction not to mock notification systems, this was left undone and disclosed rather than faked.

---

## 4. Bug Log

*(Populated during the guided walkthrough. Empty until Anshh confirms an issue.)*

| # | Feature # | Description | Severity | Recommended fix | Status |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

**Severity definitions for this review:**
- **Critical** — fabricates data, crashes a screen, or a core flow (login, order placement, etc.) is broken.
- **High** — a real feature doesn't work as specified but doesn't fabricate data or crash.
- **Medium** — cosmetic/UX issue, edge case not handled gracefully, minor accessibility gap.
- **Low** — nice-to-have, doesn't affect correctness or usability materially.

Any fix applied here will be followed by a full re-run of `pnpm lint`, `pnpm test`, and `pnpm build` (or the `/tmp/build`-scratch-copy workaround for Blocker B1 if run directly against the mounted Desktop folder), with results appended below the fix.

---

## 5. Sign-off gate

Sprint 10 is marked **COMPLETE** only when every row below is checked by Anshh — not by Atlas, not by any builder.

| # | Feature | Anshh confirmed? |
|---|---|---|
| 1 | App Shell & Responsive Navigation | ⬜ |
| 2 | Authentication | ⬜ |
| 3 | Theme Toggle | ⬜ |
| 4 | Dashboard & Market Workspace | ⬜ |
| 5 | Research Workspace | ⬜ |
| 6 | AI Council | ⬜ |
| 7 | CIO Workspace | ⬜ |
| 8 | Paper Trading | ⬜ |
| 9 | Trade Journal | ⬜ |
| 10 | Portfolio Dashboard | ⬜ |
| 11 | Analytics Dashboard | ⬜ |
| 12 | Courses & Lessons | ⬜ |
| 13 | Glossary | ⬜ |
| 14 | Strategies | ⬜ |
| 15 | Quizzes | ⬜ |
| 16 | Settings Panel | ⬜ |
| 17 | Global Search | ⬜ |
| 18 | Accessibility Pass | ⬜ |
| 19 | Data-Freshness Indicators | ⬜ |
| 20 | Notifications (deferred, confirmed acceptable to leave deferred) | ⬜ |
| — | Bug Log reviewed, all Critical/High items resolved and re-verified | ⬜ |

Once every box is checked, I will update `REBUILD_LOG.md`, `SPRINT_BOOK.md`, and `EXECUTION_BOOK.md` to mark Sprint 10 (Frontend) fully CLOSED and move to Sprint 11 scoping.
