import { z } from 'zod';

// Reused verbatim from services/portfolio/src/validation.ts (itself reused
// from services/education/src/validation.ts) -- the generic zod-failure
// shape every service's app.ts route handlers already expect. apps/api's
// own gateway-authored routes (the 20 in-process research/ai/cio/
// paper-trading/journal routes -- task 9.2/9.8) use this same
// ValidationFailure/validateBody contract so a caller sees one consistent
// 400 shape everywhere in the API, proxied or not (the five proxied
// services already return this shape themselves).
export interface ValidationFailure {
  error: string;
  details: Array<{ path: string; message: string }>;
}

export type ValidationResult<T> = { success: true; data: T } | { success: false; failure: ValidationFailure };

export function validateBody<T>(schema: z.ZodType<T>, body: unknown): ValidationResult<T> {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    failure: {
      error: 'Validation failed',
      details: result.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join('.') : '(body)',
        message: issue.message,
      })),
    },
  };
}

// Same Date.parse-based ISO-timestamp check every other service's
// validation.ts already uses (originating in services/journal/src/pnl.ts's
// validateOutcome) -- one validation convention for "is this string a real
// timestamp" across the whole codebase.
const isoTimestamp = z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
  message: 'must be a valid ISO 8601 timestamp',
});

// Non-empty-string path-param check, shared by every {id}/{symbol} route
// below (journalGetEntry, journalRecordOutcome, researchFundamentals) --
// openapi.yaml documents each of these as "400: Malformed or empty
// id/symbol", so an empty string must fail validation rather than reach
// the repository/business layer as a silent no-op lookup.
export const idParamSchema = z.object({ id: z.string().min(1) });
export type IdParam = z.infer<typeof idParamSchema>;

export const symbolParamSchema = z.object({ symbol: z.string().min(1) });
export type SymbolParam = z.infer<typeof symbolParamSchema>;

// ---------------------------------------------------------------------------
// Shared building blocks (packages/shared-types/src/index.ts /
// apps/api/openapi.yaml components), reused across several of the route
// schemas below exactly as the source composes them.
// ---------------------------------------------------------------------------

// PriceBar -- services/research's common OHLCV input shape.
const priceBarSchema = z.object({
  timestampIso: isoTimestamp,
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

// OrderSide -- reused by both Fill (embedded in CreateJournalEntryInput)
// and OrderRequest below, same as openapi.yaml's own OrderSide component.
const orderSideSchema = z.enum(['buy', 'sell']);

// ResearchGap -- returned instead of a fabricated/partial result whenever a
// research module's required input is missing (Sprint 4 task 4.6). Reused
// as one half of every *AnalysisResult union in the next section.
const researchGapReasonSchema = z.enum([
  'insufficient_history',
  'missing_option_chain',
  'missing_fundamentals',
  'missing_sector_data',
]);

const researchGapSchema = z.object({
  status: z.literal('gap'),
  reason: researchGapReasonSchema,
  detail: z.string(),
});

// ExpertName / Verdict / ExpertOpinion -- the AI Council's common output
// shape, reused as input to the three synthesis agents (strategy/risk/
// education) and to /v1/cio/verdict below.
const expertNameSchema = z.enum([
  'technical',
  'options',
  'sector',
  'quant',
  'strategy',
  'risk',
  'fundamental',
  'indices',
  'education',
]);

const verdictSchema = z.enum(['bullish', 'moderately_bullish', 'neutral', 'moderately_bearish', 'bearish']);

const expertOpinionSchema = z.object({
  expert: expertNameSchema,
  verdict: verdictSchema,
  confidence: z.number().min(0).max(100),
  reasoning: z.array(z.string()),
  generatedAtIso: isoTimestamp,
});

// TradeIdea / CioVerdict -- composed into CreateJournalEntryInput's
// optional tradeIdea/cioVerdict fields below. (CioVerdictWithTrace, the
// /v1/cio/verdict *response* shape, is never a request body anywhere and
// so has no schema in this file.)
const tradeIdeaSchema = z.object({
  symbol: z.string(),
  direction: z.enum(['long', 'short']),
  entry: z.number(),
  stopLoss: z.number(),
  target: z.number(),
  riskRewardRatio: z.number(),
  educationNote: z.string().optional(),
});

const cioVerdictSchema = z.object({
  verdict: verdictSchema,
  confidence: z.number(),
  opinions: z.array(expertOpinionSchema),
  tradeIdeas: z.array(tradeIdeaSchema),
  generatedAtIso: isoTimestamp,
});

// ---------------------------------------------------------------------------
// The five research *AnalysisResult unions (ok-shape | ResearchGap). Each is
// the *response* of its POST /v1/research/* route, but is ALSO the request
// *body* of the matching POST /v1/ai/agents/* route (the AI Council agents
// take a research result as their input and short-circuit to a gap opinion
// when status is 'gap') -- so these are declared here, not just as response
// documentation, and exported for that reuse.
// ---------------------------------------------------------------------------

// TechnicalAnalysisResult -- request body for POST /v1/ai/agents/technical
// *and* POST /v1/ai/agents/indices (Decision D7: indices has no dedicated
// research module or agent input type, it reuses this exact shape and
// TechnicalAgent's interpretation, only relabeling the expert field).
const technicalIndicatorSetSchema = z.object({
  status: z.literal('ok'),
  symbol: z.string(),
  rsi14: z.number(),
  ema20: z.number(),
  ema50: z.number(),
  macd: z.object({
    macdLine: z.number(),
    signalLine: z.number(),
    histogram: z.number(),
  }),
  volume: z.object({
    averageVolume: z.number(),
    latestVolume: z.number(),
    volumeSpike: z.boolean(),
  }),
  breakout: z.object({
    direction: z.enum(['up', 'down', 'none']),
    level: z.number(),
  }),
  generatedAtIso: isoTimestamp,
});

export const technicalAnalysisResultSchema = z.union([technicalIndicatorSetSchema, researchGapSchema]);
export type TechnicalAnalysisResultBody = z.infer<typeof technicalAnalysisResultSchema>;

// OptionAnalysisResult -- request body for POST /v1/ai/agents/options.
const optionChainAnalysisSchema = z.object({
  status: z.literal('ok'),
  symbol: z.string(),
  putCallRatio: z.number(),
  oiShift: z.object({
    calls: z.number(),
    puts: z.number(),
  }),
  interpretation: z.enum(['call_writing', 'put_writing', 'call_unwinding', 'put_unwinding', 'neutral']),
  generatedAtIso: isoTimestamp,
});

export const optionAnalysisResultSchema = z.union([optionChainAnalysisSchema, researchGapSchema]);
export type OptionAnalysisResultBody = z.infer<typeof optionAnalysisResultSchema>;

// SectorAnalysisResult -- request body for POST /v1/ai/agents/sector.
const sectorAnalysisSchema = z.object({
  status: z.literal('ok'),
  sector: z.string(),
  relativeStrengthPct: z.number(),
  rotation: z.enum(['inflow', 'outflow', 'neutral']),
  generatedAtIso: isoTimestamp,
});

export const sectorAnalysisResultSchema = z.union([sectorAnalysisSchema, researchGapSchema]);
export type SectorAnalysisResultBody = z.infer<typeof sectorAnalysisResultSchema>;

// QuantAnalysisResult -- request body for POST /v1/ai/agents/quant.
const quantSignalSetSchema = z.object({
  status: z.literal('ok'),
  symbol: z.string(),
  zScore: z.number(),
  volatilityAnnualizedPct: z.number(),
  meanReversionSignal: z.enum(['buy', 'sell', 'hold']),
  generatedAtIso: isoTimestamp,
});

export const quantAnalysisResultSchema = z.union([quantSignalSetSchema, researchGapSchema]);
export type QuantAnalysisResultBody = z.infer<typeof quantAnalysisResultSchema>;

// FundamentalAnalysisResult -- request body for POST /v1/ai/agents/fundamental.
const fundamentalAnalysisSchema = z.object({
  status: z.literal('ok'),
  symbol: z.string(),
  peRatio: z.number(),
  debtToEquity: z.number(),
  revenueGrowthYoyPct: z.number(),
  netProfitMarginPct: z.number(),
  verdict: z.enum(['strong', 'stable', 'weak']),
  generatedAtIso: isoTimestamp,
});

export const fundamentalAnalysisResultSchema = z.union([fundamentalAnalysisSchema, researchGapSchema]);
export type FundamentalAnalysisResultBody = z.infer<typeof fundamentalAnalysisResultSchema>;

// ---------------------------------------------------------------------------
// POST /v1/research/technical -- services/research/src/technical.ts
// analyzeTechnical(symbol, bars).
// ---------------------------------------------------------------------------
export const analyzeTechnicalBodySchema = z.object({
  symbol: z.string().min(1),
  bars: z.array(priceBarSchema),
});
export type AnalyzeTechnicalBody = z.infer<typeof analyzeTechnicalBodySchema>;

// ---------------------------------------------------------------------------
// POST /v1/research/options -- services/research/src/options.ts
// analyzeOptionChain(snapshot). The request body IS the OptionChainSnapshot
// itself, not a wrapper object.
// ---------------------------------------------------------------------------
const optionStrikeDataSchema = z.object({
  strike: z.number(),
  callOpenInterest: z.number(),
  putOpenInterest: z.number(),
  callOpenInterestPrevious: z.number(),
  putOpenInterestPrevious: z.number(),
});

export const optionChainSnapshotBodySchema = z.object({
  symbol: z.string().min(1),
  underlyingPrice: z.number(),
  strikes: z.array(optionStrikeDataSchema),
});
export type OptionChainSnapshotBody = z.infer<typeof optionChainSnapshotBodySchema>;

// ---------------------------------------------------------------------------
// POST /v1/research/sector -- services/research/src/sector.ts
// analyzeSector(sector, sectorBars, benchmarkBars, rotationThresholdPct?).
// rotationThresholdPct defaults to 2 inside analyzeSector itself when
// omitted -- left optional/undefined here rather than hardcoding that
// default in the gateway too, so there is exactly one owner of the default.
// ---------------------------------------------------------------------------
export const analyzeSectorBodySchema = z.object({
  sector: z.string().min(1),
  sectorBars: z.array(priceBarSchema),
  benchmarkBars: z.array(priceBarSchema),
  rotationThresholdPct: z.number().optional(),
});
export type AnalyzeSectorBody = z.infer<typeof analyzeSectorBodySchema>;

// ---------------------------------------------------------------------------
// POST /v1/research/quant -- services/research/src/quant.ts
// analyzeQuant(symbol, bars, period?). period defaults to 20 inside
// analyzeQuant itself when omitted -- same one-owner-of-the-default
// reasoning as rotationThresholdPct above.
// ---------------------------------------------------------------------------
export const analyzeQuantBodySchema = z.object({
  symbol: z.string().min(1),
  bars: z.array(priceBarSchema),
  period: z.number().optional(),
});
export type AnalyzeQuantBody = z.infer<typeof analyzeQuantBodySchema>;

// GET /v1/research/fundamentals/{symbol} has no request body -- its only
// input is the {symbol} path param, covered by symbolParamSchema above.

// ---------------------------------------------------------------------------
// POST /v1/ai/agents/technical, /v1/ai/agents/options, /v1/ai/agents/sector,
// /v1/ai/agents/quant, /v1/ai/agents/fundamental, /v1/ai/agents/indices --
// all six take one of the *AnalysisResult unions declared above as their
// request body (indices reuses technicalAnalysisResultSchema per Decision
// D7). No new schemas needed here.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// POST /v1/ai/agents/strategy, /v1/ai/agents/education -- StrategyAgentInput
// and EducationAgentInput are the identical { opinions } shape (openapi.yaml:
// "Same shape as EducationAgentInput -- both are synthesis agents that take
// the other experts' opinions").
// ---------------------------------------------------------------------------
export const opinionsOnlyBodySchema = z.object({
  opinions: z.array(expertOpinionSchema),
});
export type OpinionsOnlyBody = z.infer<typeof opinionsOnlyBodySchema>;

// ---------------------------------------------------------------------------
// POST /v1/ai/agents/risk -- RiskAgentInput. volatilityAnnualizedPct is
// optional; services/ai/src/agents/risk-agent.ts treats an omitted value as
// 0 (low risk) rather than rejecting the request.
// ---------------------------------------------------------------------------
export const riskAgentBodySchema = z.object({
  opinions: z.array(expertOpinionSchema),
  volatilityAnnualizedPct: z.number().optional(),
});
export type RiskAgentBody = z.infer<typeof riskAgentBodySchema>;

// ---------------------------------------------------------------------------
// POST /v1/cio/verdict -- services/cio/src/cio.ts buildCioVerdict(input).
// dataValid must be derived by the caller from real upstream state (e.g.
// false if any research/agent input was a ResearchGap) -- this schema only
// checks it is present and boolean; it cannot enforce that it was computed
// honestly, that discipline lives with the caller (never hardcode true).
// portfolio (PortfolioRiskContext) is supplied directly here -- no
// auto-wiring to live services/portfolio state yet (Decision D19 sub-part 8).
// ---------------------------------------------------------------------------
const portfolioRiskContextSchema = z.object({
  currentDrawdownPct: z.number(),
  maxDrawdownPct: z.number(),
  currentExposurePct: z.number(),
  maxExposurePct: z.number(),
});

export const buildCioVerdictBodySchema = z.object({
  symbol: z.string().min(1),
  opinions: z.array(expertOpinionSchema),
  referencePrice: z.number(),
  portfolio: portfolioRiskContextSchema,
  dataValid: z.boolean(),
  minConfidence: z.number().optional(),
  minRiskRewardRatio: z.number().optional(),
  stopLossPct: z.number().optional(),
  targetRiskRewardRatio: z.number().optional(),
});
export type BuildCioVerdictBody = z.infer<typeof buildCioVerdictBodySchema>;

// ---------------------------------------------------------------------------
// POST /v1/paper-trading/orders -- OrderRequest. services/paper-trading/src
// /execution.ts's placeOrder() independently re-validates symbol/side/
// quantity and throws InvalidOrderError -- this schema is the gateway's
// first line of defense (a fast 400 before the business layer is even
// called), not a replacement for that check.
// ---------------------------------------------------------------------------
export const placeOrderBodySchema = z.object({
  symbol: z.string().min(1),
  side: orderSideSchema,
  quantity: z.number(),
});
export type PlaceOrderBody = z.infer<typeof placeOrderBodySchema>;

// ---------------------------------------------------------------------------
// POST /v1/journal/entries -- CreateJournalEntryInput. fill is required;
// tradeIdea/cioVerdict compose the TradeIdea/CioVerdict shapes directly
// rather than re-flattening them into parallel field names (openapi.yaml).
// A trade placed with no CIO recommendation behind it is an honest,
// reportable gap (both fields simply absent), never a fabricated value
// (Decision D16).
// ---------------------------------------------------------------------------
const fillSchema = z.object({
  symbol: z.string(),
  side: orderSideSchema,
  quantity: z.number(),
  price: z.number(),
  filledAtIso: isoTimestamp,
  priceAsOfIso: isoTimestamp,
});

export const createJournalEntryBodySchema = z.object({
  userId: z.string().optional(),
  fill: fillSchema,
  tradeIdea: tradeIdeaSchema.optional(),
  cioVerdict: cioVerdictSchema.optional(),
});
export type CreateJournalEntryBody = z.infer<typeof createJournalEntryBodySchema>;

// ---------------------------------------------------------------------------
// POST /v1/journal/entries/{id}/outcome -- RecordOutcomeInput. {id} itself
// is validated by idParamSchema above; exitPrice/exitAtIso's stricter
// business rules (exitPrice must be positive, entry must still be open)
// are enforced by services/journal/src/pnl.ts's validateOutcome, not
// re-implemented here -- same first-line-of-defense reasoning as
// placeOrderBodySchema above.
// ---------------------------------------------------------------------------
export const recordOutcomeBodySchema = z.object({
  exitPrice: z.number(),
  exitAtIso: isoTimestamp,
});
export type RecordOutcomeBody = z.infer<typeof recordOutcomeBodySchema>;
