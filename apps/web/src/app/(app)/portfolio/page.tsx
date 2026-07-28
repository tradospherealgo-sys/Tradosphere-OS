'use client';

// Task 10.4: Portfolio. Mounts the real summary/performance/allocation/risk
// reads -- see portfolio-dashboard.tsx for why positions()/cash()/pnl() are
// not called separately (summary() already returns their figures).
import { PortfolioDashboard } from '@/components/portfolio-dashboard';

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Portfolio</h1>
        <p className="mt-1 text-sm text-muted">
          Real positions, cash, P&L, allocation, and risk from the paper account.
        </p>
      </div>

      <PortfolioDashboard />
    </div>
  );
}
