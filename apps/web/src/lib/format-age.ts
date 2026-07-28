// Task 10.6: shared "time ago" formatter, extracted from the near-identical
// copies already living in market-bar.tsx and cio-verdict-panel.tsx so new
// 10.6 freshness indicators (Portfolio/Analytics/Journal) don't add a third
// and fourth copy of the same logic. Existing call sites are left as-is --
// touching them is out of 10.6's scope.
export function formatAge(ms: number): string {
  if (ms < 0) return 'just now';
  if (ms < 1000) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}
