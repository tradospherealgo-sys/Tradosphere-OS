'use client';

// Task 10.4: Analytics. Mounts the real performance/strategy/instrument/
// session/heatmap/distribution/monthly reads -- see analytics-dashboard.tsx
// for why the six single-metric endpoints are not called separately
// (performance() already returns a superset FullStatSet).
import { AnalyticsDashboard } from '@/components/analytics-dashboard';

export default function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="mt-1 text-sm text-muted">
          Real stats computed from the journal&apos;s closed trades.
        </p>
      </div>

      <AnalyticsDashboard />
    </div>
  );
}
