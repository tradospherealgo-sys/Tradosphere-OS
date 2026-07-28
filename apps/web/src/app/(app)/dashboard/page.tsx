'use client';

// Task 10.1 (Foundation) + Task 10.2 (Dashboard + Market Workspace). The
// live market bar, CIO verdict panel, and expert status row all come from
// one shared useMarketStream() connection so the whole page agrees on a
// single WebSocket status -- see src/hooks/use-market-stream.ts.
import { useAuth } from '@/lib/auth-context';
import { useMarketStream } from '@/hooks/use-market-stream';
import { MarketBar } from '@/components/market-bar';
import { CioVerdictPanel } from '@/components/cio-verdict-panel';
import { ExpertStatusRow } from '@/components/expert-status-row';

export default function DashboardPage() {
  const { user } = useAuth();
  const { status, ticksBySymbol, verdict, verdictReceivedAt } = useMarketStream();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Welcome back{user ? `, ${user.email}` : ''}</h1>
        <p className="mt-1 text-sm text-muted">
          Signed in as <span className="font-medium text-text">{user?.role}</span> via the real
          gateway session.
        </p>
      </div>

      <MarketBar status={status} ticksBySymbol={ticksBySymbol} />
      <CioVerdictPanel status={status} verdict={verdict} verdictReceivedAt={verdictReceivedAt} />
      <ExpertStatusRow status={status} verdict={verdict} verdictReceivedAt={verdictReceivedAt} />
    </div>
  );
}
