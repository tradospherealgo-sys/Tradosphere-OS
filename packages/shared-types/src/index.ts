// Shared domain types used across every Tradosphere OS service and app.
// This is the single contract every module (research, ai, cio, frontend) must conform to.

export interface MarketTick {
  symbol: string;
  price: number;
  volume: number;
  timestampIso: string;
}

export type ExpertName =
  | 'technical'
  | 'options'
  | 'sector'
  | 'quant'
  | 'strategy'
  | 'risk'
  | 'fundamental'
  | 'indices'
  | 'education';

export type Verdict = 'bullish' | 'moderately_bullish' | 'neutral' | 'moderately_bearish' | 'bearish';

export interface ExpertOpinion {
  expert: ExpertName;
  verdict: Verdict;
  confidence: number; // 0-100
  reasoning: string[];
  generatedAtIso: string;
}

export interface TradeIdea {
  symbol: string;
  direction: 'long' | 'short';
  entry: number;
  stopLoss: number;
  target: number;
  riskRewardRatio: number;
  educationNote?: string;
}

export interface CioVerdict {
  verdict: Verdict;
  confidence: number;
  opinions: ExpertOpinion[];
  tradeIdeas: TradeIdea[];
  generatedAtIso: string;
}

// --- Sprint 4: Research Engine ---
// One shared shape for "not enough/no data" across all five analysis
// disciplines below (task 4.6). Every module returns this instead of a
// fabricated or partially-filled result when its required input is missing.
export type ResearchGapReason =
  | 'insufficient_history'
  | 'missing_option_chain'
  | 'missing_fundamentals'
  | 'missing_sector_data';

export interface ResearchGap {
  status: 'gap';
  reason: ResearchGapReason;
  detail: string;
}

export interface PriceBar {
  timestampIso: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicatorSet {
  status: 'ok';
  symbol: string;
  rsi14: number;
  ema20: number;
  ema50: number;
  macd: { macdLine: number; signalLine: number; histogram: number };
  volume: { averageVolume: number; latestVolume: number; volumeSpike: boolean };
  breakout: { direction: 'up' | 'down' | 'none'; level: number };
  generatedAtIso: string;
}
export type TechnicalAnalysisResult = TechnicalIndicatorSet | ResearchGap;

export interface OptionStrikeData {
  strike: number;
  callOpenInterest: number;
  putOpenInterest: number;
  callOpenInterestPrevious: number;
  putOpenInterestPrevious: number;
}

export interface OptionChainSnapshot {
  symbol: string;
  underlyingPrice: number;
  strikes: OptionStrikeData[];
}

export interface OptionChainAnalysis {
  status: 'ok';
  symbol: string;
  putCallRatio: number;
  oiShift: { calls: number; puts: number };
  interpretation: 'call_writing' | 'put_writing' | 'call_unwinding' | 'put_unwinding' | 'neutral';
  generatedAtIso: string;
}
export type OptionAnalysisResult = OptionChainAnalysis | ResearchGap;

export interface FundamentalAnalysis {
  status: 'ok';
  symbol: string;
  peRatio: number;
  debtToEquity: number;
  revenueGrowthYoyPct: number;
  netProfitMarginPct: number;
  verdict: 'strong' | 'stable' | 'weak';
  generatedAtIso: string;
}
export type FundamentalAnalysisResult = FundamentalAnalysis | ResearchGap;

export interface SectorAnalysis {
  status: 'ok';
  sector: string;
  relativeStrengthPct: number;
  rotation: 'inflow' | 'outflow' | 'neutral';
  generatedAtIso: string;
}
export type SectorAnalysisResult = SectorAnalysis | ResearchGap;

export interface QuantSignalSet {
  status: 'ok';
  symbol: string;
  zScore: number;
  volatilityAnnualizedPct: number;
  meanReversionSignal: 'buy' | 'sell' | 'hold';
  generatedAtIso: string;
}
export type QuantAnalysisResult = QuantSignalSet | ResearchGap;
