'use client';

import { useTheme } from '@/lib/theme-context';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {isDark ? 'Dark' : 'Light'}
    </button>
  );
}
