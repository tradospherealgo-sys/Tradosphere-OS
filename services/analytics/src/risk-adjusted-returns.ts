import type { EquitySnapshotRecord } from './equity-source';

export interface RiskAdjustedReturns {
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  // True only when there are fewer than 2 real period returns to work with
  // at all (i.e. fewer than 3 snapshots). False does NOT guarantee both
  // ratios are non-null -- a zero-variance sample (every period return
  // identical) still makes the ratio mathematically undefined, and that
  // case is reported as sharpeRatio/sortinoRatio === null on their own,
  // same "explicit gap, never a fabricated number" contract as everywhere
  // else in this service.
  insufficientData: boolean;
}

// Period returns: (equity_i - equity_{i-1}) / equity_{i-1} for each
// consecutive pair of real portfolio_snapshots rows, in ascending asOf
// order (EquitySnapshotSource's own contract). A period whose starting
// equity is non-positive is skipped entirely (a percentage return against
// a zero-or-negative base is undefined, not zero) rather than silently
// distorting the series with a fabricated value.
function periodReturns(snapshots: EquitySnapshotRecord[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1].totalEquity;
    const curr = snapshots[i].totalEquity;
    if (prev <= 0) continue;
    returns.push((curr - prev) / prev);
  }
  return returns;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Sample standard deviation (n-1 denominator) -- the standard choice when
// computing a ratio from a finite historical sample of returns rather than
// the full population of all returns that will ever occur.
function sampleStdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// Decision D18: risk-free rate defaults to 0 (documented, configurable via
// the second parameter, never a fabricated real-world rate -- no rate feed
// exists anywhere in this codebase). Both ratios are derived from
// consecutive portfolio_snapshots period returns (the equity curve), never
// per-trade realizedPnl -- a per-trade series has no consistent time
// interval between entries, which a Sharpe/Sortino computation requires to
// mean anything.
//
// Sharpe = (mean period return - riskFreeRate) / stddev(all period
// returns). Sortino uses the same numerator divided by the *downside*
// deviation (stddev of negative period returns only) instead of full
// stddev -- the standard distinction between the two ratios: Sortino
// doesn't penalize upside volatility.
//
// insufficientData is true (both ratios null) whenever there are fewer
// than 2 period returns to compute a variance from at all. Separately,
// either ratio individually is null whenever its own deviation is exactly
// 0 -- a zero-variance sample makes the ratio mathematically undefined/
// infinite, not a real number, so it is reported as a gap rather than
// Infinity or a fabricated value.
export function computeRiskAdjustedReturns(
  snapshots: EquitySnapshotRecord[],
  riskFreeRate = 0,
): RiskAdjustedReturns {
  const returns = periodReturns(snapshots);

  if (returns.length < 2) {
    return { sharpeRatio: null, sortinoRatio: null, insufficientData: true };
  }

  const avgReturn = mean(returns);
  const stdDev = sampleStdDev(returns, avgReturn);

  const downsideReturns = returns.filter((r) => r < 0);
  const downsideDev = downsideReturns.length >= 2 ? sampleStdDev(downsideReturns, mean(downsideReturns)) : 0;

  const sharpeRatio = stdDev === 0 ? null : (avgReturn - riskFreeRate) / stdDev;
  const sortinoRatio = downsideDev === 0 ? null : (avgReturn - riskFreeRate) / downsideDev;

  return { sharpeRatio, sortinoRatio, insufficientData: false };
}
