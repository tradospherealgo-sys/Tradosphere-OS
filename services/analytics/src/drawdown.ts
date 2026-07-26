import type { EquitySnapshotRecord } from './equity-source';

// Max Drawdown %: the largest peak-to-trough decline in the real equity
// curve (portfolio_snapshots.totalEquity, read via EquitySnapshotSource --
// Decision D18), expressed as a fraction of the running peak at the time
// of the trough (0.15 = a 15% drawdown from that peak). Snapshots must
// already be in ascending asOf order (EquitySnapshotSource's own
// contract), so the running peak walk below reads the curve exactly in
// the order it happened.
//
// Requires >= 2 snapshots to define even one peak-to-trough move -- NULL
// (never a fabricated 0) below that, mirroring analytics-schema.ts's
// max_drawdown_pct column contract.
export function computeMaxDrawdownPct(snapshots: EquitySnapshotRecord[]): number | null {
  if (snapshots.length < 2) return null;

  let peak = snapshots[0].totalEquity;
  let maxDrawdown = 0;

  for (const snapshot of snapshots) {
    if (snapshot.totalEquity > peak) {
      peak = snapshot.totalEquity;
    }
    // A non-positive peak makes "% decline from peak" undefined (there is
    // no meaningful percentage off a zero-or-negative base) -- skipped
    // rather than producing a nonsensical or divide-by-zero figure. This
    // is a genuine edge case only for an account that started or fell to
    // zero/negative equity, not the common path.
    if (peak > 0) {
      const drawdown = (peak - snapshot.totalEquity) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}
