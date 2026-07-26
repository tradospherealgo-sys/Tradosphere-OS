# Sprint 9 (APIs) — AI Team Independent Audit

**Date:** 2026-07-26
**Audit scope:** `apps/api` gateway (9.1–9.15), `packages/sdk`, `openapi.yaml`
**Trigger:** Anshh asked for an independent `ai-team` audit of Sprint 9, separate from the `ai-exec-team`'s own self-verification, to confirm whether Sprint 9 is genuinely 100% complete.
**Method:** Fresh sync to a scratch build, re-reading source files directly, and re-running install/build/lint/test independently rather than trusting the prior session's reported numbers.

---

## Headline finding

**The claim "all three exit criteria are met" is functionally true — the code, tests, and OpenAPI spec all independently check out exactly as reported. But the repository is currently in a state where CI cannot run at all.**

`pnpm-lock.yaml` was never regenerated after `packages/sdk` was created (task 9.6) or after `@tradosphere/sdk` was added as a devDependency of `apps/api` (today's B17 fix). Reproduced directly against the real source tree, unmodified:

```
$ pnpm install --frozen-lockfile
 ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because
 pnpm-lock.yaml is not up to date with packages/sdk/package.json
```

`.github/workflows/ci.yml` line 61 runs exactly `pnpm install --frozen-lockfile` as its first step, before lint, build, or test. **CI is currently broken and would fail on the next push or PR, before any of Sprint 9's actual work is exercised.** This was not caught by any of the "full-repo verification" entries logged in `EXECUTION_BOOK.md`, which evidently used a plain, non-frozen `pnpm install` locally — a mode that silently absorbs lockfile drift instead of failing the way CI does.

The fix is mechanical and low-risk: run `pnpm install` (no `--frozen-lockfile`) once and commit the regenerated `pnpm-lock.yaml`. No code or design changes are required. But as of this audit, it has not been done.

---

## Independent re-verification (this audit's own evidence)

| Claim | Independently reproduced? | Evidence |
|---|---|---|
| `pnpm install --frozen-lockfile` succeeds | **No — fails** | `ERR_PNPM_OUTDATED_LOCKFILE`, reproduced against the live source repo (not just the scratch copy) |
| `apps/api` test suite: 62/62 | Yes, once lockfile drift is worked around and the monorepo is built via the root `turbo` pipeline | `Test Files 3 passed (3) / Tests 62 passed (62)` including `sdk.test.ts` 4/4 |
| Full monorepo build: 19/19 | Yes | `Tasks: 19 successful, 19 total` |
| Full monorepo lint: 19/19 | Yes | `Tasks: 19 successful, 19 total` |
| Full monorepo test: 38/38 tasks | Yes | `Tasks: 38 successful, 38 total` |
| `openapi.yaml`: 80 paths / 103 operations / 109 schemas / 0 duplicate `operationId`s / valid | Yes, via `openapi_spec_validator.validate()` | exact match to the claimed numbers |
| B15 fix present (`proxy.ts` content-type parser) | Yes | `scope.removeAllContentTypeParsers()` at `apps/api/src/proxy.ts:124` |
| Auth-required across in-process routes + 429 rate-limit test | Yes | `apps/api/test/app.test.ts:703-708` |
| `packages/sdk`'s own test script | Still the literal stub `echo "no tests yet"` | `packages/sdk/package.json:10` — unchanged by B17 |
| `docs/architecture/api-gateway.md` test count | Stale — still says `58/58`, not updated to `62/62` after B17 | line 180 |

One process nuance worth noting, not a defect: running `pnpm --filter @tradosphere/api test` in isolation fails with a confusing Vite module-resolution error unless `packages/sdk` has already been built. This is because `turbo.json`'s `test` task depends on this package's own `build`, and `build` depends on `^build` (all workspace dependencies, including devDependencies like `@tradosphere/sdk`) — so the root `pnpm build && pnpm test` pipeline (what CI and the reported evidence actually use) handles this correctly, but a developer iterating on `apps/api` alone, without running the root build first, will hit a confusing error rather than a clear "build the SDK first" message.

---

## Independent Expert Reviews

**Nova — Architecture: 90/100**
The proxy/in-process route split, the `TradosphereClient` composing 11 domain sub-clients behind one shared `HttpClient`, and the single-point error normalization (`SdkHttpError`) are clean, consistent designs. Housing the SDK's only tests inside `apps/api/test/sdk.test.ts` rather than `packages/sdk/test/` is a defensible reuse-over-duplication call (it reuses the gateway's existing real-server test harness rather than standing up a second one), but it inverts the normal expectation that a package owns its own tests, and combined with the unchanged stub `test` script, it makes `packages/sdk` look untested to anyone who inspects it in isolation.

**Aegis — Security: 82/100**
Auth-by-default and rate limiting are both real and tested, not just claimed. B15 (JSON bodies silently corrupted to `"[object Object]"` when proxied) was a genuine data-corruption bug and the fix plus regression coverage is solid. Docked points because the broken CI install step means the automated safety net (lint/build/test on every push) is not currently functional — a deployment-readiness gap squarely in Aegis's remit, independent of whether any single vulnerability exists in the code itself.

**Orion — Trading/AI Logic: 88/100**
Sprint 9 is infrastructure, not new trading logic, so scope here is narrow: does the gateway expose journal/paper-trading/CIO/research routes without altering their semantics. `sdk.test.ts`'s authenticated round trip (`createEntry` → `getEntry`, asserting `userId` propagation) is a good sanity check that JWT identity survives the real HTTP path. No fabricated data or silent fallbacks found; `proxy.ts` fails loudly (502) on a genuinely unreachable target per D21.

**Pulse — QA/Performance: 74/100**
All of the reported test/build/lint counts are accurate and reproducible — but only once the lockfile problem above is worked around. That gap is exactly the kind of thing an independent audit exists to catch: the ai-exec-team's own "full-repo verification passed" claims were true for the install mode they happened to use locally, but not for the install mode CI actually runs. Also flags the stale `58/58` count in `docs/architecture/api-gateway.md` (the same class of documentation-accuracy gap as Sprint 8's B14) and the confusing isolated-test-run failure mode noted above.

---

## Board Discussion

Aegis and Pulse agree the lockfile gap is the material finding and outranks the two documentation nits. The disagreement was whether this rises to NO GO. Resolution by evidence: the underlying gateway, auth, rate limiting, WebSocket layer, OpenAPI spec, and SDK are all independently proven correct and match their claimed test coverage exactly — nothing here is a design flaw or an unresolved technical question. The lockfile issue is a single mechanical command (`pnpm install`, then commit `pnpm-lock.yaml`) with no ambiguity about the fix. That profile — real, verified functionality blocked from being provably CI-safe by one uncommitted, zero-risk step — matches a CONDITIONAL GO, not a NO GO, but it is a more consequential finding than Sprint 8's B14 (which was pure documentation drift) because it actually breaks the CI pipeline outright rather than just describing it inaccurately.

---

## Zenith's Final Verdict

```
AUDIT SUMMARY
==============
Project:                Tradosphere OS — Sprint 9 (APIs)
Date:                   2026-07-26
Audit Scope:            apps/api gateway (9.1-9.15), packages/sdk, openapi.yaml

SCORECARDS
===========
Architecture:           90/100
Security:               82/100
Trading/AI Logic:       88/100
Backend Quality:        87/100
Testing:                78/100
Performance:            85/100
Documentation:          65/100
Maintainability:        85/100
Deployment Readiness:   55/100
Production Readiness:   68/100

OVERALL SCORE:          79/100

FINAL VERDICT
==============
[X] CONDITIONAL GO — functionally complete and correct; one CI-blocking
    process gap must be closed before Sprint 9 can be called fully done.

CRITICAL ISSUE:
- pnpm-lock.yaml is out of sync with packages/sdk/package.json and
  apps/api's new @tradosphere/sdk devDependency. `pnpm install
  --frozen-lockfile` (CI's first step) fails right now. Fix: run
  `pnpm install` and commit the regenerated pnpm-lock.yaml. No code
  changes needed.

NON-BLOCKING FINDINGS:
- docs/architecture/api-gateway.md still cites 58/58 apps/api tests;
  actual is 62/62 after B17.
- packages/sdk/package.json's own `test` script is still the stub
  `echo "no tests yet"`, even though real tests for it now exist
  (in apps/api/test/sdk.test.ts).

QUICK WINS:
- Regenerate + commit pnpm-lock.yaml (closes the CI blocker).
- Update the stale test count in docs/architecture/api-gateway.md.
- Point packages/sdk's test script at where its tests actually live.
```

**Direct answer to "is it complete 100%?": No, not yet — the implementation is complete and everything it claims to do is independently verified true, but the repository cannot currently pass its own CI pipeline due to an uncommitted lockfile regeneration. That is a same-session, zero-design-risk fix, not a rebuild.**
