// Task 10.2: shared connection-status pill used by both MarketBar and
// CioVerdictPanel so the two never disagree about what "connected" looks
// like -- one source of truth for the label/color mapping.
import type { MarketStreamStatus } from '@/lib/market-stream';

const LABEL: Record<MarketStreamStatus, string> = {
  connecting: 'Connecting…',
  open: 'Live',
  reconnecting: 'Reconnecting…',
  disconnected: 'Disconnected',
};

const DOT_CLASS: Record<MarketStreamStatus, string> = {
  connecting: 'bg-accent animate-pulse',
  open: 'bg-success',
  reconnecting: 'bg-accent animate-pulse',
  disconnected: 'bg-danger',
};

export function ConnectionBadge({ status }: { status: MarketStreamStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" role="status">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[status]}`} aria-hidden="true" />
      {LABEL[status]}
    </span>
  );
}
