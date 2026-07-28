'use client';

// Task 10.6: Settings. Real, read-only account info from GET /v1/auth/me
// (MeResponse's full shape -- id/email/role, nothing invented) plus the
// existing real theme control. Before writing this file, packages/sdk's
// client.ts (11 sub-clients), auth.ts (6 routes), types.ts's MeResponse, and
// a repo-wide grep of openapi.yaml for "settings"/"notification" and every
// PATCH/PUT route were all checked: there is no profile-update, password-
// change, or preferences route anywhere in the spec. So this screen does not
// offer to edit anything it can't actually persist -- it shows what's real
// and explicitly says what isn't, per Anshh's Sprint 10.6 instruction to
// "clearly mark unsupported functionality in the UI where necessary" rather
// than fabricate a settings-save flow. See EXECUTION_BOOK.md's Sprint 10.6
// section for the full deferred-capability list.
import { useEffect, useState } from 'react';
import { SdkHttpError } from '@tradosphere/sdk';
import type { MeResponse } from '@tradosphere/sdk';
import { sdk } from '@/lib/sdk';
import { useAuth } from '@/lib/auth-context';
import { ThemeToggle } from './theme-toggle';

type SectionState<T> =
  { phase: 'loading' } | { phase: 'loaded'; data: T } | { phase: 'error'; message: string };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof SdkHttpError ? err.message : fallback;
}

export function SettingsPanel() {
  const { logout } = useAuth();
  const [account, setAccount] = useState<SectionState<MeResponse>>({ phase: 'loading' });

  useEffect(() => {
    sdk.auth
      .me()
      .then((data) => setAccount({ phase: 'loaded', data }))
      .catch((err) =>
        setAccount({
          phase: 'error',
          message: errorMessage(err, 'Could not reach the auth service.'),
        }),
      );
  }, []);

  return (
    <div className="space-y-4">
      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="settings-account-heading"
      >
        <h2 id="settings-account-heading" className="text-sm font-medium">
          Account
        </h2>

        {account.phase === 'loading' && (
          <p className="mt-3 text-sm text-muted" role="status">
            Loading…
          </p>
        )}
        {account.phase === 'error' && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {account.message}
          </p>
        )}
        {account.phase === 'loaded' && (
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Email</dt>
              <dd className="text-sm font-medium">{account.data.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Role</dt>
              <dd className="text-sm font-medium">{account.data.role}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Account ID</dt>
              <dd className="text-sm font-medium">{account.data.id}</dd>
            </div>
          </dl>
        )}

        <button
          type="button"
          onClick={() => void logout()}
          className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Log out
        </button>
      </section>

      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="settings-appearance-heading"
      >
        <h2 id="settings-appearance-heading" className="text-sm font-medium">
          Appearance
        </h2>
        <p className="mt-1 text-xs text-muted">
          Switch between light and dark theme. Saved to this browser.
        </p>
        <div className="mt-3">
          <ThemeToggle />
        </div>
      </section>

      <section
        className="rounded-lg border border-border bg-surface p-4"
        aria-labelledby="settings-unavailable-heading"
      >
        <h2 id="settings-unavailable-heading" className="text-sm font-medium">
          Not yet available
        </h2>
        <p className="mt-2 text-sm text-muted">
          Profile editing, password changes, and notification preferences aren&apos;t shown here
          because no backend route exists yet to save them. These are deferred to a future sprint
          rather than faked with a form that doesn&apos;t actually persist anything.
        </p>
      </section>
    </div>
  );
}
