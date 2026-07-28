'use client';

// Task 10.1 (Foundation): route-group guard for every authenticated screen
// (10.2-10.6 all mount under this group). Renders an explicit loading state
// while the session is being restored/verified against the real gateway,
// and redirects to /login rather than ever rendering a protected screen
// with no verified user -- Vega charter rule 1 (no placeholder rendered as
// real data) applies to "who is logged in" just as much as to market data.
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AppShell } from '@/components/app-shell';

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div
        className="flex min-h-screen items-center justify-center text-sm text-muted"
        role="status"
      >
        Restoring your session…
      </div>
    );
  }

  if (status === 'unauthenticated') {
    // Redirect above is in flight -- render nothing rather than a flash of
    // protected content.
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
