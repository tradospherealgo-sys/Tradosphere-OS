// Task 10.1 (Foundation) -- THE Broker-abstraction guarantee, enforced in
// code, not just by convention: this is the one and only place apps/web
// constructs a TradosphereClient or touches a base URL. Every screen in
// every later phase (10.2-10.6) must import `sdk` from here and call
// `sdk.<domain>.<method>()` -- never `fetch()` directly, never anything from
// `@tradosphere/broker-core` or a broker-specific package. Because the
// gateway (Sprint 9) already sits behind the `BrokerClient` port (Decision
// D5) and apps/web only ever speaks to the gateway through this one typed
// client, swapping the simulated broker for a real one later requires zero
// frontend changes -- there is no broker-shaped code here to update.
import { TradosphereClient } from '@tradosphere/sdk';
import { getAccessToken } from './token-store';

// Exported (not just local) so `src/lib/market-stream.ts` (Task 10.2) can
// derive the gateway's WebSocket URL from the exact same source rather than
// reading `process.env.NEXT_PUBLIC_API_BASE_URL` a second time -- the
// guarantee stays "one file touches a base URL", not "one file per
// transport touches a base URL".
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export const sdk = new TradosphereClient({
  baseUrl: API_BASE_URL,
  getAccessToken,
});
