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

// --- Sprint 8: Trading ---
// Order/Fill live here (not local to services/paper-trading) because task
// 8.2 (journal), 8.3 (portfolio), 8.4 (analytics), and Sprint 10 task 10.3
// (paper trading/journal/portfolio screens) all consume the same shape --
// same reasoning as TradeIdea/CioVerdict above.
export type OrderSide = 'buy' | 'sell';

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  quantity: number;
}

// Decision D14: a Fill always carries the real market tick's own price and
// timestamp (priceAsOfIso) separately from when the order itself executed
// (filledAtIso) -- so a consumer (journal, portfolio) can always tell how
// fresh the price behind a fill was, never just trust a single timestamp.
export interface Fill {
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  filledAtIso: string;
  priceAsOfIso: string;
}

// --- Sprint 8: Journal (task 8.2) ---
// Decision D16: neither TradeIdea, CioVerdict, nor Fill is ever persisted
// upstream of a journal entry -- a JournalEntry is the FIRST point of
// persistence for a paper trade, snapshotting the real Fill (8.1) alongside
// the TradeIdea/CioVerdict recommendation it was based on, exactly as
// generated. Every `recommended*`/`cio*` field is optional: a trade placed
// with no CIO recommendation behind it is an honest, reportable gap, never
// a fabricated value (Delta charter rule 5).
export type JournalEntryStatus = 'open' | 'closed';

export interface JournalEntry {
  id: string;
  userId?: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  fillPrice: number;
  filledAtIso: string;
  priceAsOfIso: string;
  recommendedDirection?: 'long' | 'short';
  recommendedEntry?: number;
  recommendedStopLoss?: number;
  recommendedTarget?: number;
  recommendedRiskRewardRatio?: number;
  cioVerdictLabel?: Verdict;
  cioConfidence?: number;
  educationNote?: string;
  recommendationGeneratedAtIso?: string;
  status: JournalEntryStatus;
  exitPrice?: number;
  exitAtIso?: string;
  realizedPnl?: number;
  createdAtIso: string;
}

// `cioVerdict` here takes the whole Sprint 6 CioVerdict object (verdict +
// confidence + generatedAtIso all come from it) -- composing the existing
// type directly rather than re-flattening it into new parameter names is
// what makes this "linking", not a parallel invented shape.
export interface CreateJournalEntryInput {
  userId?: string;
  fill: Fill;
  tradeIdea?: TradeIdea;
  cioVerdict?: CioVerdict;
}

export interface RecordOutcomeInput {
  exitPrice: number;
  exitAtIso: string;
}
