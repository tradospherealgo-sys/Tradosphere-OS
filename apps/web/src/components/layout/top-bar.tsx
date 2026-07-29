'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { ConnectionBadge } from '@/components/connection-badge';
import type { MarketStreamStatus } from '@/lib/market-stream';

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <span className="tabular-nums text-xs font-medium text-muted">
      {time.toLocaleTimeString('en-US', { hour12: false })}
    </span>
  );
}

export function TopBar({
  marketStatus,
  onMenuToggle,
  onSearchFocus,
}: {
  marketStatus?: MarketStreamStatus;
  onMenuToggle?: () => void;
  onSearchFocus?: () => void;
}) {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur-xl">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-text md:hidden"
          aria-label="Toggle navigation"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Global search trigger */}
        <button
          onClick={onSearchFocus}
          className="hidden h-7 items-center gap-2 rounded-lg border border-border bg-bg/50 px-3 text-xs text-muted transition-colors hover:border-accent/30 sm:flex"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Search anything…
          <kbd className="ml-4 rounded border border-border px-1 text-[10px] text-muted">⌘K</kbd>
        </button>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {marketStatus && <ConnectionBadge status={marketStatus} />}
        <Clock />
        <div className="mx-1 h-4 w-px bg-border" />
        <ThemeToggle />
        <div className="mx-1 h-4 w-px bg-border" />

        {user && (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <span className="hidden text-xs text-muted lg:inline">{user.email}</span>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-text"
              aria-label="Sign out"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
