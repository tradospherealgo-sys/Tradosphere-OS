// Task 10.1 (Foundation): the ONLY place session tokens are read from or
// written to browser storage. `src/lib/sdk.ts`'s TradosphereClient reads the
// access token through `getAccessToken` below rather than any component
// reaching into localStorage directly -- keeps token handling in one spot,
// same discipline services/auth's own token issuance code already follows
// server-side (Cipher charter rule 1: secrets/tokens handled in exactly one
// place, never scattered).
import type { Role } from '@tradosphere/sdk';

const STORAGE_KEY = 'tradosphere.session.v1';

export interface StoredUser {
  id: string;
  email: string;
  role: Role;
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: StoredUser;
}

let current: StoredSession | null = null;
let hydrated = false;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/** Reads the persisted session once, on first access, from localStorage. */
function hydrate(): void {
  if (hydrated || !isBrowser()) return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) current = JSON.parse(raw) as StoredSession;
  } catch {
    // Corrupt/unavailable storage -- treat as logged out rather than throw.
    current = null;
  }
}

export function getSession(): StoredSession | null {
  hydrate();
  return current;
}

export function setSession(session: StoredSession): void {
  current = session;
  hydrated = true;
  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}

export function clearSession(): void {
  current = null;
  hydrated = true;
  if (isBrowser()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

/** Passed directly as SdkConfig.getAccessToken. */
export function getAccessToken(): string | undefined {
  return getSession()?.accessToken;
}
