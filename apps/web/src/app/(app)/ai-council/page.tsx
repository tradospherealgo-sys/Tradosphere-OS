'use client';

// Task 10.3: AI Council Workspace -- the full per-expert breakdown of
// whatever CioVerdict has actually arrived over /stream on this page's own
// connection (see useMarketStream's per-mount lifecycle).
import { useMarketStream } from '@/hooks/use-market-stream';
import { AiCouncilDetail } from '@/components/ai-council-detail';

export default function AiCouncilPage() {
  const { status, verdict, verdictReceivedAt } = useMarketStream();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">AI Council</h1>
        <p className="mt-1 text-sm text-muted">
          Every expert opinion behind the current CIO verdict, in full.
        </p>
      </div>

      <AiCouncilDetail status={status} verdict={verdict} verdictReceivedAt={verdictReceivedAt} />
    </div>
  );
}
