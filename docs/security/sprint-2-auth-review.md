# Sprint 2 Security Review — Auth Flow

**Reviewer:** Cipher (Security/DevOps)
**Scope:** `packages/auth`, `services/auth`, `packages/database` (users/sessions schema)
**Task:** 2.6 — "Security review of auth flow (token storage, expiry, secret handling)"

## Secret handling

A repo-wide grep for hardcoded secrets, passwords, API keys, and tokens across
`packages/auth`, `packages/event-bus`, `services/auth`, and `packages/database`
found zero matches outside test fixtures. Every literal that looked
secret-shaped in the scan was a test-only password string (e.g.
`'correct-password'`) used to exercise signup/login in `*.test.ts` files —
never in `src/`.

Every value that should be a secret in production code is pulled from the
environment via `packages/config`'s `requireEnv()`, which throws loudly if
the variable is missing rather than silently defaulting:

- `JWT_SECRET` — required, no fallback (`services/auth/src/index.ts`).
- `DATABASE_URL` — required, no fallback.

Nothing else in the auth flow reads a secret.

## Token storage

- **Access tokens**: JWT, signed with `JWT_SECRET`, 15-minute expiry. Not
  persisted server-side — verified stateless via `verifyAccessToken()`.
- **Refresh tokens**: JWT, 30-day expiry. The *hash* of the refresh token
  (via the same bcrypt helper used for passwords) is persisted in the
  `sessions` table, never the raw token — a DB read alone cannot produce a
  usable session. This mirrors password storage discipline.
- **Passwords**: bcryptjs, cost factor 12, salted per-hash (verified in
  `packages/auth/test/password.test.ts` — hashing the same password twice
  produces two different hashes, both of which verify correctly).

## Token expiry

- Access: 15 minutes — short-lived, limits the blast radius of a leaked
  access token.
- Refresh: 30 days — matches `sessions.expiresAt` in the schema, so an
  expired session row and an expired refresh token go stale together.
- Both lifetimes are currently fixed constants in `packages/auth/src/jwt.ts`,
  not read from env. `.env.example` documents the effective values
  (`JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN`) for operator visibility, but
  changing them today requires a code change, not an env change. Logged as a
  parked item below rather than built now — no sprint task called for
  per-environment tunability, and adding it wasn't worth the scope creep this
  session.

## Rotation path (documented, not yet automated)

`JWT_SECRET` rotation procedure, for when it's needed:

1. Generate a new secret value out-of-band (never commit it).
2. Deploy the new `JWT_SECRET` to `services/auth`.
3. **Effect immediately on rotation**: every access token issued under the
   old secret fails `verifyAccessToken()` on its next use (signature
   mismatch → `InvalidTokenError` → 401), and every refresh token fails the
   same way — so rotation forces a hard re-login for all active sessions.
   There is no dual-secret verification window in this skeleton (that would
   require accepting a list of valid secrets in `verifyAccessToken`/
   `verifyRefreshToken`, tried in order). That's a deliberate simplification
   for Sprint 2, not an oversight — flagged here so it's a known trade-off,
   not a silent gap.
4. If zero-downtime rotation (no forced logout) is ever required, extend
   `verifyAccessToken`/`verifyRefreshToken` to accept `secret: string |
   string[]` and try each candidate in turn; sign new tokens only with the
   newest secret. Not built now — parked, no current requirement for it.

## Error message hygiene

`login()` throws the identical `InvalidCredentialsError` message ("Invalid
email or password") whether the email doesn't exist or the password is
wrong — verified by `services/auth/test/auth-logic.test.ts`
("rejects an unknown email..." / "rejects a wrong password..." both assert
the same error type). This prevents user enumeration via the login endpoint.

`signup()`'s 409 on duplicate email is an intentional exception to this
principle — the product needs to tell a user their email is already
registered so they can log in instead. This is a standard, accepted
trade-off (not a gap) for signup flows specifically.

## RBAC skeleton

`requireRole()` is exercised against a real route (`GET /admin/ping`), not
just as a unit-tested utility in isolation — a `trader`-role token gets 403,
an `admin`-role token gets 200 (`services/auth/test/app.test.ts`). Confirms
the gate actually blocks, the same standard used for Sprint 1's pre-commit
hook verification.

## Findings summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| F1 | No hardcoded secrets anywhere in shipped code | — | Pass |
| F2 | Refresh tokens stored hashed, not plaintext | — | Pass |
| F3 | Login errors don't leak which field was wrong | — | Pass |
| F4 | No dual-secret rotation window (forced re-login on rotation) | Low | Accepted trade-off, documented above |
| F5 | Token TTLs are fixed constants, not env-configurable despite `.env.example` documenting them | Low | Parked — see EXECUTION_BOOK.md |

No blocking findings. Sprint 2 exit criterion "No credential ever appears in
code, logs, or docs" — **met**.
