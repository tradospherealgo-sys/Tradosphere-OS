'use client';

import { useAuth } from '@/lib/auth-context';
import { useMarketStream } from '@/hooks/use-market-stream';
import { MarketBar } from '@/components/market-bar';
import { CioVerdictPanel } from '@/components/cio-verdict-panel';
import { ExpertStatusRow } from '@/components/expert-status-row';
import { Card, Panel, StatCard, Badge } from '@/components/ui';

export default function DashboardPage() {
  const { user } = useAuth();
  const { status, ticksBySymbol, verdict, verdictReceivedAt } = useMarketStream();

  return (
    <div className="space-y-5">
      {/* Welcome + quick stats */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">
            Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'},{' '}
            {user?.email.split('@')[0] || 'trader'}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
        <Badge color="accent" variant="soft" dot>
          {new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short',
          })}
        </Badge>
      </div>

      {/* Quick stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Portfolio Value" value="₹0.00" change="+0.00%" trend="neutral" />
        <StatCard label="Day P&L" value="₹0.00" change="+0.00" trend="neutral" />
        <StatCard label="Open Positions" value="0" />
        <StatCard label="Buying Power" value="₹100,000" />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <MarketBar status={status} ticksBySymbol={ticksBySymbol} />
          <ExpertStatusRow
            status={status}
            verdict={verdict}
            verdictReceivedAt={verdictReceivedAt}
          />
        </div>
        <div className="space-y-5">
          <CioVerdictPanel
            status={status}
            verdict={verdict}
            verdictReceivedAt={verdictReceivedAt}
          />

          {/* AI Recommendations placeholder */}
          <Panel
            title="AI Recommendations"
            icon={
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
                <path d="M8 14v2a4 4 0 0 0 8 0v-2" />
                <line x1="12" y1="18" x2="12" y2="22" />
              </svg>
            }
          >
            <p className="text-sm text-muted">
              Awaiting next CIO verdict for trade recommendations.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
