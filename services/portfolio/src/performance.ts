import type { MtmResult } from './mtm';

export interface PerformanceMetrics {
  startingCash: number;
  totalEquity: number;
  totalReturn: number;
  totalReturnPct: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

// Decision D17 scopes "Performance Metrics" to portfolio-level totals only
// for task 8.3 -- win rate, risk/reward ratio, and drawdown need a
// trade-by-trade time series that belongs to services/analytics (task 8.4,
// per SPRINT_BOOK.md's own task split), not a duplicate partial
// implementation squeezed in here.
export function computePerformanceMetrics(mtm: MtmResult, startingCash: number): PerformanceMetrics {
  const totalReturn = mtm.totalEquity - startingCash;
  const totalReturnPct = startingCash === 0 ? 0 : totalReturn / startingCash;

  return {
    startingCash,
    totalEquity: mtm.totalEquity,
    totalReturn: totalReturn === 0 ? 0 : totalReturn,
    totalReturnPct: totalReturnPct === 0 ? 0 : totalReturnPct,
    realizedPnl: mtm.realizedPnl,
    unrealizedPnl: mtm.unrealizedPnl,
  };
}
