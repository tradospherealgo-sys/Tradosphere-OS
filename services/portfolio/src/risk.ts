import type { PricedPosition } from './positions';
import { positionMarketValue } from './positions';

export interface RiskExposure {
  grossExposure: number;
  netExposure: number;
  leverageRatio: number;
  largestPositionPct: number;
}

// Decision D17 scope: risk exposure at the portfolio level only for 8.3 --
// gross/net exposure and leverage are computable purely from priced
// positions and totalEquity, with no fabricated inputs. Per-trade risk
// (stop-loss distance, R:R) depends on the CIO recommendation snapshot,
// which is nullable on journal_entries (Decision D16) and therefore not
// always present -- a portfolio-level risk view that only worked when every
// trade had a CIO idea behind it would silently misrepresent accounts that
// don't, so that per-trade view is left to task 8.4's services/analytics
// instead.
export function computeRiskExposure(pricedPositions: PricedPosition[], totalEquity: number): RiskExposure {
  let gross = 0;
  let net = 0;
  const absValues: number[] = [];

  for (const priced of pricedPositions) {
    const value = positionMarketValue(priced);
    absValues.push(Math.abs(value));
    gross += Math.abs(value);
    net += value;
  }

  const largest = absValues.reduce((max, v) => Math.max(max, v), 0);

  return {
    grossExposure: gross,
    netExposure: net === 0 ? 0 : net,
    leverageRatio: totalEquity === 0 ? 0 : gross / totalEquity,
    largestPositionPct: gross === 0 ? 0 : largest / gross,
  };
}
