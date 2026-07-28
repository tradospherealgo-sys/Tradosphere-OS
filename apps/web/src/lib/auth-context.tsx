'use client';

// Task 10.1 (Foundation): thin React wiring around auth-actions.ts. Every
// screen that needs the current user reads it from this context, not from
// token-store.ts directly, so there's exactly one place session state
// transitions (login/logout/restore) happen and re-render the app.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { login as loginAction, logout as logoutAction, restoreSession } from './auth-actions';
import type { StoredSession, StoredUser } from './token-store';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: StoredUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSessionState] = useState<StoredSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    restoreSession().then((restored) => {
      if (cancelled) return;
      setSessionState(restored);
      setStatus(restored ? 'authenticated' : 'unauthenticated');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const next = await loginAction(email, password);
    setSessionState(next);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await logoutAction();
    setSessionState(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user: session?.user ?? null, login, logout }),
    [status, session, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
