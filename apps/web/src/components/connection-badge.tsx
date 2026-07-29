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

const CONTAINER_CLASS: Record<MarketStreamStatus, string> = {
  connecting: 'border-accent/30 bg-accent/5',
  open: 'border-success/30 bg-success/5',
  reconnecting: 'border-accent/30 bg-accent/5',
  disconnected: 'border-danger/30 bg-danger/5',
};

const RING_CLASS: Record<MarketStreamStatus, string> = {
  connecting: 'ring-accent/20',
  open: 'ring-success/20',
  reconnecting: 'ring-accent/20',
  disconnected: 'ring-danger/20',
};

export function ConnectionBadge({ status }: { status: MarketStreamStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium transition-all duration-300 ${CONTAINER_CLASS[status]} ${RING_CLASS[status]} ring-1`}
      role="status"
    >
      <span className={`relative flex h-2 w-2`}>
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-40 ${status === 'open' ? 'bg-success' : status === 'disconnected' ? 'bg-danger' : 'bg-accent'}`}
          aria-hidden="true"
        />
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${DOT_CLASS[status]}`}
          aria-hidden="true"
        />
      </span>
      {LABEL[status]}
    </span>
  );
}
