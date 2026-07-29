'use client';

// Task 10.1 (Foundation): the login screen. Calls useAuth().login, which
// goes through auth-actions.ts -> sdk.auth.login() -> the real gateway
// (/v1/auth/login, proxied to services/auth per D20) -- no client-side
// credential validation shortcut, no fake "logged in" state on failure.
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { sdk } from '@/lib/sdk';
import { SdkHttpError } from '@tradosphere/sdk';

export default function LoginPage() {
  const { login, status } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isSignup, setIsSignup] = useState(false);

  if (status === 'authenticated') {
    router.replace('/dashboard');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isSignup) {
        try {
          await sdk.auth.signup({ email, password });
        } catch (err) {
          const message = err instanceof SdkHttpError ? err.message : 'Signup failed';
          throw new Error(message);
        }
      }
      await login(email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Animated gradient background */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-accent/5" />
      <div className="pointer-events-none absolute -inset-40 animate-pulseGlow-scale opacity-30">
        <div className="h-full w-full rounded-full bg-gradient-to-r from-accent/20 via-accent/5 to-transparent blur-3xl" />
      </div>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="animate-fade-in relative w-full max-w-sm rounded-2xl border border-border bg-surface/80 p-8 shadow-2xl shadow-accent/5 backdrop-blur-xl"
        aria-labelledby="login-heading"
      >
        {/* Logo area */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent shadow-lg shadow-accent/25">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <h1 id="login-heading" className="text-xl font-bold tracking-tight">
            Tradosphere OS
          </h1>
          <p className="text-sm text-muted">Trading Intelligence Operating System</p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium text-muted">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="rounded-lg border border-border bg-bg/50 px-3 py-2.5 text-sm placeholder:text-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/20 focus-visible:outline-none"
          />
        </div>

        <div className="mt-4 flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-muted">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            className="rounded-lg border border-border bg-bg/50 px-3 py-2.5 text-sm placeholder:text-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/20 focus-visible:outline-none"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 animate-slide-down rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            <div className="flex items-center gap-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:brightness-110 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              {isSignup ? 'Creating account…' : 'Signing in…'}
            </>
          ) : isSignup ? (
            'Create account'
          ) : (
            'Sign in'
          )}
        </button>

        <div className="mt-6 text-center text-sm text-muted">
          {isSignup ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsSignup(false);
                  setError(null);
                }}
                className="font-medium text-accent hover:underline"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsSignup(true);
                  setError(null);
                }}
                className="font-medium text-accent hover:underline"
              >
                Create one
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
