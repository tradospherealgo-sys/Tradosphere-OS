import type { PriceBar, SectorAnalysisResult } from '@tradosphere/shared-types';

// Task 4.4: relative strength + rotation read for one sector against a
// benchmark (e.g. a sector index vs. NIFTY 50). Reuses the same `PriceBar`
// input contract as analyzeTechnical (4.1) rather than inventing a new bar
// shape. Returns an explicit gap (reason: 'missing_sector_data') instead of a
// fabricated relative-strength number when either series is too short to
// compute a period return from -- same discipline as 4.1/4.2/4.3.
function periodReturnPct(bars: PriceBar[]): number {
  const first = bars[0].close;
  const last = bars[bars.length - 1].close;
  return ((last - first) / first) * 100;
}

export function analyzeSector(
  sector: string,
  sectorBars: PriceBar[],
  benchmarkBars: PriceBar[],
  rotationThresholdPct = 2,
): SectorAnalysisResult {
  if (sectorBars.length < 2 || benchmarkBars.length < 2) {
    return {
      status: 'gap',
      reason: 'missing_sector_data',
      detail: `insufficient price history to compute relative strength for ${sector}`,
    };
  }

  const sectorReturnPct = periodReturnPct(sectorBars);
  const benchmarkReturnPct = periodReturnPct(benchmarkBars);
  const relativeStrengthPct = Math.round((sectorReturnPct - benchmarkReturnPct) * 100) / 100;

  let rotation: 'inflow' | 'outflow' | 'neutral' = 'neutral';
  if (relativeStrengthPct > rotationThresholdPct) {
    rotation = 'inflow';
  } else if (relativeStrengthPct < -rotationThresholdPct) {
    rotation = 'outflow';
  }

  return {
    status: 'ok',
    sector,
    relativeStrengthPct,
    rotation,
    generatedAtIso: new Date().toISOString(),
  };
}
