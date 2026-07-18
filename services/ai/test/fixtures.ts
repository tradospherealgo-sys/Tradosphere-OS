import type {
  FundamentalAnalysis,
  OptionChainAnalysis,
  QuantSignalSet,
  ResearchGap,
  SectorAnalysis,
  TechnicalIndicatorSet,
} from '@tradosphere/shared-types';

// Task 5.2/5.3 fixtures: hand-built Research Engine *output* shapes (not
// computed via services/research -- services/ai deliberately depends only
// on packages/shared-types, not on services/research, so agents are tested
// purely against the shared contract).

export function makeGap(reason: ResearchGap['reason'] = 'insufficient_history', detail = 'not enough data'): ResearchGap {
  return { status: 'gap', reason, detail };
}

export function makeTechnical(overrides: Partial<TechnicalIndicatorSet> = {}): TechnicalIndicatorSet {
  return {
    status: 'ok',
    symbol: 'RELIANCE',
    rsi14: 68,
    ema20: 105,
    ema50: 100,
    macd: { macdLine: 1.2, signalLine: 0.8, histogram: 0.4 },
    volume: { averageVolume: 100000, latestVolume: 180000, volumeSpike: true },
    breakout: { direction: 'up', level: 102 },
    generatedAtIso: new Date().toISOString(),
    ...overrides,
  };
}

export function makeOptionChain(overrides: Partial<OptionChainAnalysis> = {}): OptionChainAnalysis {
  return {
    status: 'ok',
    symbol: 'TCS',
    putCallRatio: 0.8,
    oiShift: { calls: 5000, puts: -2000 },
    interpretation: 'call_writing',
    generatedAtIso: new Date().toISOString(),
    ...overrides,
  };
}

export function makeSector(overrides: Partial<SectorAnalysis> = {}): SectorAnalysis {
  return {
    status: 'ok',
    sector: 'IT',
    relativeStrengthPct: 3.5,
    rotation: 'inflow',
    generatedAtIso: new Date().toISOString(),
    ...overrides,
  };
}

export function makeQuant(overrides: Partial<QuantSignalSet> = {}): QuantSignalSet {
  return {
    status: 'ok',
    symbol: 'TCS',
    zScore: -1.8,
    volatilityAnnualizedPct: 22.5,
    meanReversionSignal: 'buy',
    generatedAtIso: new Date().toISOString(),
    ...overrides,
  };
}

export function makeFundamental(overrides: Partial<FundamentalAnalysis> = {}): FundamentalAnalysis {
  return {
    status: 'ok',
    symbol: 'INFY',
    peRatio: 22,
    debtToEquity: 0.4,
    revenueGrowthYoyPct: 18,
    netProfitMarginPct: 19,
    verdict: 'strong',
    generatedAtIso: new Date().toISOString(),
    ...overrides,
  };
}
