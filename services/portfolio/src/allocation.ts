import type { PositionDirection, PricedPosition } from './positions';
import { positionMarketValue } from './positions';

export interface AllocationEntry {
  symbol: string;
  direction: PositionDirection;
  marketValue: number;
  // Share of total absolute exposure this position represents --
  // denominator is Σ|marketValue| across all positions, so a fully-hedged
  // book (equal long and short) still sums allocations to 100%, not 0%.
  allocationPct: number;
}

// "Allocation Summary" and "Asset Distribution" are the same computation
// under Sprint 8.3's two different SPRINT_BOOK.md names -- one function,
// not two near-duplicate mechanisms (the same "don't build two of the same
// thing" reasoning Decision D17 already applied to Equity Curve/Portfolio
// History).
export function computeAllocation(pricedPositions: PricedPosition[]): AllocationEntry[] {
  const entries = pricedPositions.map((priced) => ({
    symbol: priced.position.symbol,
    direction: priced.position.direction,
    marketValue: positionMarketValue(priced),
  }));

  const totalAbsExposure = entries.reduce((sum, entry) => sum + Math.abs(entry.marketValue), 0);

  return entries
    .map((entry) => ({
      ...entry,
      allocationPct: totalAbsExposure === 0 ? 0 : Math.abs(entry.marketValue) / totalAbsExposure,
    }))
    .sort((a, b) => b.allocationPct - a.allocationPct);
}
