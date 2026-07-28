'use client';

// Task 10.1 (Foundation): the responsive shell + nav every later screen
// renders inside. Sidebar collapses to a top bar + slide-over on narrow
// viewports (Tailwind's `md:` breakpoint), not a second layout.
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './theme-toggle';
import { NAV_ITEMS } from './nav-items';
import { useAuth } from '@/lib/auth-context';

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = item.href != null && pathname === item.href;
        if (!item.href) {
          return (
            <span
              key={item.label}
              aria-disabled="true"
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-muted"
            >
              {item.label}
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                Soon
              </span>
            </span>
          );
        }
        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
              active ? 'bg-accent/10 text-accent font-medium' : 'text-text hover:bg-surface'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      {/* Task 10.6: skip-to-content link -- first focusable element in the DOM,
          visually hidden until keyboard-focused, so keyboard/screen-reader
          users can bypass the nav (which repeats on every page) and land
          straight in <main>. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface p-4 md:block">
        <div className="mb-6 text-lg font-semibold">Tradosphere OS</div>
        <NavLinks />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent md:hidden"
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            Menu
          </button>
          <span className="text-sm font-medium md:hidden">Tradosphere OS</span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {user && (
              <div className="flex items-center gap-2 text-sm">
                <span className="hidden text-muted sm:inline">{user.email}</span>
                <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                  {user.role}
                </span>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Mobile nav slide-over */}
        {mobileNavOpen && (
          <div id="mobile-nav" className="border-b border-border bg-surface p-4 md:hidden">
            <NavLinks onNavigate={() => setMobileNavOpen(false)} />
          </div>
        )}

        <main id="main-content" tabIndex={-1} className="flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
