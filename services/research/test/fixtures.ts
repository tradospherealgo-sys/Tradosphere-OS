import type { OptionChainSnapshot, OptionStrikeData, PriceBar } from '@tradosphere/shared-types';

// Builds `count` daily bars starting 2026-01-01, close price moving by
// `stepPerBar` each bar (0 = flat, +1 = strict uptrend, -1 = strict
// downtrend). high/low are +-1 around the close, volume is constant unless
// overridden per-index by `volumeOverride`.
export function makeBars(
  count: number,
  options: { startPrice?: number; stepPerBar?: number; volume?: number; volumeOverride?: Record<number, number> } = {},
): PriceBar[] {
  const { startPrice = 100, stepPerBar = 0, volume = 1000, volumeOverride = {} } = options;
  const bars: PriceBar[] = [];
  for (let i = 0; i < count; i += 1) {
    const close = startPrice + stepPerBar * i;
    bars.push({
      timestampIso: new Date(2026, 0, 1 + i).toISOString(),
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: volumeOverride[i] ?? volume,
    });
  }
  return bars;
}

// Builds a minimal option chain snapshot from a list of partial per-strike
// overrides. Any field left unspecified defaults to 0, so callers only need
// to set the fields their test case cares about.
export function makeOptionChain(
  symbol: string,
  strikes: Array<Partial<OptionStrikeData> & { strike: number }>,
  underlyingPrice = 100,
): OptionChainSnapshot {
  return {
    symbol,
    underlyingPrice,
    strikes: strikes.map((s) => ({
      strike: s.strike,
      callOpenInterest: s.callOpenInterest ?? 0,
      putOpenInterest: s.putOpenInterest ?? 0,
      callOpenInterestPrevious: s.callOpenInterestPrevious ?? 0,
      putOpenInterestPrevious: s.putOpenInterestPrevious ?? 0,
    })),
  };
}
