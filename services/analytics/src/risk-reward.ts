import type { JournalEntryRecord } from './journal-source';
import { closedTradesOf } from './trade-stats';

// Planned Risk/Reward Ratio: mean of recommendedRiskRewardRatio across
// every entry (open OR closed) that has one. This is the CIO's stated R:R
// *at trade placement time* (Decision D16) -- a property of the
// recommendation, not the outcome -- so it is computed over all entries
// with the field populated, not just closed ones. NULL (never a fabricated
// 0) when nothing in the set has a recommendation behind it at all.
export function computePlannedRiskRewardRatio(entries: JournalEntryRecord[]): number | null {
  const ratios = entries
    .map((e) => e.recommendedRiskRewardRatio)
    .filter((r): r is number => r !== null && r !== undefined);
  if (ratios.length === 0) return null;
  return ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
}

// Realized Risk/Reward Ratio: the average winning trade's realizedPnl
// divided by the average losing trade's |realizedPnl| -- the standard
// "what R:R did this trader actually achieve" figure, computed purely from
// real closed-trade outcomes (never from recommendedStopLoss/
// recommendedTarget, which describe the CIO's *plan*, not what actually
// happened). NULL when there are no losing trades (the ratio is
// undefined, not infinite) or no winning trades -- never a fabricated
// number in either edge case.
export function computeRealizedRiskRewardRatio(entries: JournalEntryRecord[]): number | null {
  const closed = closedTradesOf(entries);
  const wins = closed.filter((t) => t.realizedPnl > 0);
  const losses = closed.filter((t) => t.realizedPnl < 0);
  if (wins.length === 0 || losses.length === 0) return null;

  const avgWin = wins.reduce((sum, t) => sum + t.realizedPnl, 0) / wins.length;
  const avgLoss = Math.abs(losses.reduce((sum, t) => sum + t.realizedPnl, 0) / losses.length);
  if (avgLoss === 0) return null;

  return avgWin / avgLoss;
}
