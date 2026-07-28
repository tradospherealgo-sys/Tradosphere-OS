// Task 10.1 (Foundation): auth logic as plain, testable functions -- kept
// separate from auth-context.tsx's React wiring so apps/web/test/
// auth-flow.test.ts can drive a real login round trip against a real bound
// server without needing a DOM/React renderer, mirroring the boundary
// apps/api/test/sdk.test.ts already draws between "real network round trip"
// and "framework wiring".
import { sdk } from './sdk';
import { setSession, clearSession, getSession, type StoredSession } from './token-store';
import { SdkHttpError } from '@tradosphere/sdk';

export class AuthActionError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'AuthActionError';
    this.cause = cause;
  }
}

/** Logs in via the real gateway/SDK and persists the resulting session. Never fabricates a session on failure. */
export async function login(email: string, password: string): Promise<StoredSession> {
  try {
    const result = await sdk.auth.login({ email, password });
    const session: StoredSession = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };
    setSession(session);
    return session;
  } catch (err) {
    if (err instanceof SdkHttpError) {
      throw new AuthActionError(
        err.status === 401 ? 'Incorrect email or password.' : `Login failed (HTTP ${err.status}).`,
        err,
      );
    }
    throw new AuthActionError(
      'Could not reach the gateway. Check your connection and try again.',
      err,
    );
  }
}

/** Best-effort logout: clears the local session even if the server call fails (token may already be expired). */
export async function logout(): Promise<void> {
  const session = getSession();
  clearSession();
  if (!session) return;
  try {
    await sdk.auth.logout({ refreshToken: session.refreshToken });
  } catch {
    // Idempotent per AuthClient's own contract -- a failure here just means
    // the refresh token was already revoked/expired server-side. The local
    // session is already cleared above, which is what matters to the UI.
  }
}

/**
 * Revalidates the current session against the real gateway (GET /v1/auth/me).
 * On a 401, attempts exactly one refresh-then-retry before giving up and
 * clearing the session -- never silently keeps a session the server has
 * already rejected, and never fabricates a user.
 */
export async function restoreSession(): Promise<StoredSession | null> {
  const session = getSession();
  if (!session) return null;

  try {
    const me = await sdk.auth.me();
    return { ...session, user: me };
  } catch (err) {
    if (err instanceof SdkHttpError && err.status === 401) {
      try {
        const refreshed = await sdk.auth.refresh({ refreshToken: session.refreshToken });
        const nextSession: StoredSession = {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          user: refreshed.user,
        };
        setSession(nextSession);
        return nextSession;
      } catch {
        clearSession();
        return null;
      }
    }
    // A network/5xx failure shouldn't silently log the user out -- surface
    // the existing locally-known session rather than fabricate a fresh one.
    return session;
  }
}
