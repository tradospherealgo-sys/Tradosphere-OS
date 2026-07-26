// Task 9.6, Decision D19 sub-part (9): the SDK's public barrel. Re-exports
// the client, the transport primitives callers need to catch/inspect errors,
// every SDK-local type from types.ts, and the @tradosphere/shared-types
// types the gateway's routes actually speak -- so a consumer only ever
// imports from '@tradosphere/sdk', never reaching into shared-types or the
// domain modules directly.

export { TradosphereClient } from './client';
export type { SdkConfig, QueryValue, RequestOptions } from './http';
export { HttpClient, SdkHttpError } from './http';
export type { SdkErrorBody } from './http';

export { AuthClient } from './auth';
export { MarketDataClient } from './marketData';
export { EducationClient } from './education';
export type {
  EducationListFilter,
  EducationListCoursesFilter,
  EducationListLessonsFilter,
  EducationListQuizzesFilter,
} from './education';
export { PortfolioClient } from './portfolio';
export type { PortfolioHistoryFilter } from './portfolio';
export { AnalyticsClient } from './analytics';
export type { AnalyticsDateRangeFilter, AnalyticsTradeDistributionFilter } from './analytics';
export { ResearchClient } from './research';
export { AiCouncilClient } from './ai';
export { CioClient } from './cio';
export { PaperTradingClient } from './paperTrading';
export { JournalClient } from './journal';
export { InfraClient } from './infra';

// ---- All SDK-local types (gateway error envelopes + every domain type not
// already owned by a service package) ----
export * from './types';

// ---- Re-exported from @tradosphere/shared-types -- the types the gateway's
// in-process routes (research/ai/cio/paper-trading/journal) and the /stream
// WebSocket layer actually speak on the wire. Re-exported here so D19(9)'s
// "matching @tradosphere/shared-types" requirement means a consumer never
// needs a second import from shared-types alongside this package. ----
export type {
  MarketTick,
  ExpertName,
  Verdict,
  ExpertOpinion,
  TradeIdea,
  CioVerdict,
  ResearchGapReason,
  ResearchGap,
  PriceBar,
  TechnicalIndicatorSet,
  TechnicalAnalysisResult,
  OptionStrikeData,
  OptionChainSnapshot,
  OptionChainAnalysis,
  OptionAnalysisResult,
  FundamentalAnalysis,
  FundamentalAnalysisResult,
  SectorAnalysis,
  SectorAnalysisResult,
  QuantSignalSet,
  QuantAnalysisResult,
  OrderSide,
  OrderRequest,
  Fill,
  JournalEntryStatus,
  JournalEntry,
  CreateJournalEntryInput,
  RecordOutcomeInput,
} from '@tradosphere/shared-types';
