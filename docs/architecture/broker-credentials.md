# Broker Credential Handling Pattern (Sprint 3, Task 3.2)

## Status

SMC Global's broker API is not yet public. There are no real credentials to
wire up or test against (see EXECUTION_BOOK.md decision D5). This document
fixes the *pattern* every future real `BrokerClient` implementation must
follow, so that when SMC Global's API and credentials become available,
wiring them in is a small, low-risk change rather than a design exercise.

## The pattern

1. **Names only in code, values only via env/secret store.** Any real broker
   adapter (e.g. a future `SmcGlobalBrokerClient` in `services/broker/smc`)
   reads credentials exclusively through `@tradosphere/config`'s
   `requireEnv()` -- e.g. `requireEnv('SMC_GLOBAL_API_KEY')`,
   `requireEnv('SMC_GLOBAL_API_SECRET')`. This is the same pattern already
   used for `JWT_SECRET` and `DATABASE_URL` in `services/auth` (Sprint 2).
   No credential value is ever hardcoded, logged, or committed.
2. **`BrokerCredentials` stays a typed shape, not a free-form object.**
   `packages/broker-core/src/types.ts` already defines
   `BrokerCredentials { apiKey: string; apiSecret: string }` so the real
   adapter's constructor signature is fixed today, before the adapter itself
   exists.
3. **The `BrokerClient` port takes no credentials as call-site arguments.**
   Credentials are supplied once, at construction/`authenticate()` time, read
   from env inside the adapter itself -- never passed around through
   `services/market-data` or any other consumer. Consumers only ever see the
   `BrokerClient` interface (`authenticate()`, `getHistoricalTicks()`,
   `subscribeTicks()`, `disconnect()`), never a raw key or secret.
4. **`SimulatedBrokerClient` needs no credentials at all** -- it's a local,
   synthetic data generator (see its file header comment). This is
   deliberate: nothing in Sprint 3's simulated path touches secret handling,
   so there is nothing to leak while SMC Global's API is unavailable.
5. **When the real adapter is built:** add `SMC_GLOBAL_API_KEY` and
   `SMC_GLOBAL_API_SECRET` to `.env.example` (empty placeholders, following
   the existing convention), implement `SmcGlobalBrokerClient implements
   BrokerClient` in `services/broker/smc`, and re-run the same grep-based
   secret scan Cipher used in Sprint 2 (`docs/security/sprint-2-auth-review.md`)
   across `services/broker/smc` before sign-off.

## Verification performed this sprint

A grep-based secret scan (`grep -rnE "(password|secret|api[_-]?key|token)\s*[:=]\s*['\"]"`)
was run across `packages/broker-core` and `services/market-data`. No
hardcoded credentials were found -- expected, since the only implementation
shipped this sprint (`SimulatedBrokerClient`) is credential-free by design.
This satisfies 3.2's "secret scan passes" verification for the code that
actually exists today; the "adapter authenticates against SMC Global"
half of Sprint 3's exit criteria remains parked pending API availability.
