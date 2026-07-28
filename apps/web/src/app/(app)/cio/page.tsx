'use client';

// Task 10.3: CIO Workspace -- the current verdict (reusing 10.2's
// CioVerdictPanel), a feed of every trade idea actually observed this
// session, and a real tutor "explain this verdict" action. All three
// consume one shared useMarketStream() connection for this page.
import { useMarketStream } from '@/hooks/use-market-stream';
import { CioVerdictPanel } from '@/components/cio-verdict-panel';
import { TradeIdeasFeed } from '@/components/trade-ideas-feed';
import { TutorExplainPanel } from '@/components/tutor-explain-panel';

export default function CioPage() {
  const { status, verdict, verdictReceivedAt, verdictHistory } = useMarketStream();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">CIO Workspace</h1>
        <p className="mt-1 text-sm text-muted">
          The current verdict, trade ideas observed this session, and the AI tutor.
        </p>
      </div>

      <CioVerdictPanel status={status} verdict={verdict} verdictReceivedAt={verdictReceivedAt} />
      <TradeIdeasFeed verdictHistory={verdictHistory} />
      <TutorExplainPanel verdict={verdict} />
    </div>
  );
}
