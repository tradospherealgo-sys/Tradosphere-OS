'use client';

// Task 10.6: real "Updated Xs/m ago" freshness indicator for the snapshot
// screens (Portfolio, Analytics, Journal) that fetch once via REST rather
// than streaming. `atMs` is the real Date.now() captured the moment each
// section's own fetch resolved -- never a fabricated or backend-provided
// timestamp (none of summary()/performance()/strategyStats()/etc. return
// one). This satisfies "data freshness is visible" (Vega charter rule 2)
// without inventing a staleness threshold these on-demand snapshots have no
// real backend concept for -- unlike the CIO verdict stream (10.2/10.3),
// which has a genuine point-in-time-recommendation staleness rule
// (verdict-panel-state.ts) and its own STALE badge already.
import { formatAge } from '@/lib/format-age';

export function FreshnessNote({ atMs, now = Date.now() }: { atMs: number; now?: number }) {
  return (
    <span className="text-xs text-muted" role="status">
      Updated {formatAge(now - atMs)}
    </span>
  );
}
