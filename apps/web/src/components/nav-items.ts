// Task 10.1 (Foundation): the full Sprint 10 navigation map, built now so
// the shell is complete, but only the routes actually built in each phase
// carry an `href` -- everything else renders as a disabled "Soon" item
// rather than a link to a 404 or, worse, a page full of fabricated data.
// Flip `href`/`phase` as each later phase (10.2-10.6) lands its screens.
export interface NavItem {
  label: string;
  href?: string;
  phase: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', phase: '10.1' },
  // Task 10.2 built the live market bar + CIO verdict panel directly into
  // /dashboard (Anshh's instruction didn't require a separate route) --
  // this item points at the same screen rather than a second unlinked one.
  { label: 'Market Workspace', href: '/dashboard', phase: '10.2' },
  { label: 'Research', href: '/research', phase: '10.3' },
  { label: 'AI Council', href: '/ai-council', phase: '10.3' },
  { label: 'CIO', href: '/cio', phase: '10.3' },
  { label: 'Paper Trading', href: '/paper-trading', phase: '10.4' },
  { label: 'Portfolio', href: '/portfolio', phase: '10.4' },
  { label: 'Journal', href: '/journal', phase: '10.4' },
  { label: 'Analytics', href: '/analytics', phase: '10.4' },
  { label: 'Education Center', href: '/education', phase: '10.5' },
  { label: 'Settings', href: '/settings', phase: '10.6' },
  { label: 'Search', href: '/search', phase: '10.6' },
  // Task 10.6: no backend notification concept exists anywhere (no route,
  // no table, no event stream carrying anything shaped like a notification
  // -- confirmed by grepping openapi.yaml and packages/sdk/src/client.ts
  // before this decision). Per Anshh's explicit instruction not to "mock
  // notification systems," this stays href-less and renders as the
  // established disabled "Soon" nav item rather than a fake inbox. Logged as
  // a deferred capability in EXECUTION_BOOK.md's Sprint 10.6 section for
  // Sprint 11+.
  { label: 'Notifications', phase: '10.6' },
];
