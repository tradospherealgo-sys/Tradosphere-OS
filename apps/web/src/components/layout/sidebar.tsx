'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  shortcut?: string;
  section?: string;
}

const NAV_ITEMS: SidebarItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: <DashboardIcon />,
    shortcut: '⌘1',
    section: 'Main',
  },
  {
    label: 'Paper Trading',
    href: '/paper-trading',
    icon: <TradeIcon />,
    shortcut: '⌘2',
    section: 'Trading',
  },
  {
    label: 'Portfolio',
    href: '/portfolio',
    icon: <PortfolioIcon />,
    shortcut: '⌘3',
    section: 'Trading',
  },
  {
    label: 'Analytics',
    href: '/analytics',
    icon: <AnalyticsIcon />,
    shortcut: '⌘4',
    section: 'Insights',
  },
  {
    label: 'Research',
    href: '/research',
    icon: <ResearchIcon />,
    shortcut: '⌘5',
    section: 'Insights',
  },
  {
    label: 'AI Council',
    href: '/ai-council',
    icon: <AiIcon />,
    shortcut: '⌘6',
    section: 'Insights',
  },
  { label: 'CIO', href: '/cio', icon: <CioIcon />, shortcut: '⌘7', section: 'Insights' },
  { label: 'Journal', href: '/journal', icon: <JournalIcon />, shortcut: '⌘8', section: 'Records' },
  {
    label: 'Education',
    href: '/education',
    icon: <EducationIcon />,
    shortcut: '⌘9',
    section: 'Resources',
  },
  { label: 'Settings', href: '/settings', icon: <SettingsIcon />, section: 'System' },
  { label: 'Search', href: '/search', icon: <SearchIcon />, section: 'System' },
];

const SECTIONS = ['Main', 'Trading', 'Insights', 'Records', 'Resources', 'System'];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();

  return (
    <aside
      className={`flex flex-col border-r border-border bg-surface transition-all duration-300 ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* Logo */}
      <div className="flex h-12 items-center border-b border-border px-3">
        {collapsed ? (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <span className="text-sm font-bold tracking-tight">Tradosphere</span>
            </div>
            <button
              onClick={onToggle}
              className="text-muted hover:text-text"
              aria-label="Collapse sidebar"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Primary">
        {SECTIONS.map((section) => {
          const items = NAV_ITEMS.filter((i) => i.section === section && i.href);
          if (items.length === 0) return null;
          return (
            <div key={section} className="mb-3">
              {!collapsed && (
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted/50">
                  {section}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const active = item.href && pathname === item.href;
                  return (
                    <Link
                      key={item.label}
                      href={item.href!}
                      className={`group relative flex items-center rounded-lg text-sm transition-all duration-150 ${
                        collapsed ? 'justify-center h-9 w-10 mx-auto' : 'gap-2.5 px-2.5 py-2'
                      } ${
                        active
                          ? 'bg-accent/10 font-medium text-accent'
                          : 'text-text/70 hover:bg-bg hover:text-text'
                      }`}
                      title={collapsed ? item.label : undefined}
                    >
                      <span className={`shrink-0 ${active ? 'text-accent' : ''}`}>{item.icon}</span>
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          {item.shortcut && (
                            <kbd className="text-[10px] text-muted/40 group-hover:text-muted/60">
                              {item.shortcut}
                            </kbd>
                          )}
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

// Simple SVG icons for sidebar
function DashboardIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function TradeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}
function PortfolioIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
function AnalyticsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
function ResearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function AiIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
      <path d="M8 14v2a4 4 0 0 0 8 0v-2" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}
function CioIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M12 20V10" />
      <path d="M18 20V4" />
      <path d="M6 20v-4" />
    </svg>
  );
}
function JournalIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
function EducationIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
