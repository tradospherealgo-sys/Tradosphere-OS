// Task 10.2: pure state-derivation logic for CioVerdictPanel, split out of
// the component so it's directly unit-testable without rendering React
// (mirrors auth-actions.ts/token-store.ts's split from auth-context.tsx).
import type { CioVerdict } from '@tradosphere/sdk';
import type { MarketStreamStatus } from './market-stream';

export type VerdictPanelState =
  'loading' | 'awaiting-verdict' | 'active' | 'stale' | 'disconnected';

// A CIO verdict is a point-in-time recommendation, not a tick -- it isn't
// expected to refresh every few seconds. 10 minutes is a display-only
// staleness threshold (not a backend business rule): past this age the
// panel visibly flags the verdict as STALE rather than silently presenting
// old advice as current (Vega charter rule 2).
export const VERDICT_STALE_AFTER_MS = 10 * 60 * 1000;

export function deriveVerdictPanelState(
  status: MarketStreamStatus,
  verdict: CioVerdict | null,
  verdictReceivedAt: number | null,
  nowMs: number,
  staleAfterMs: number = VERDICT_STALE_AFTER_MS,
): VerdictPanelState {
  if (verdict && verdictReceivedAt !== null) {
    return nowMs - verdictReceivedAt >= staleAfterMs ? 'stale' : 'active';
  }
  if (status === 'disconnected') return 'disconnected';
  if (status === 'open') return 'awaiting-verdict';
  return 'loading'; // 'connecting' or 'reconnecting', no verdict observed yet
}
