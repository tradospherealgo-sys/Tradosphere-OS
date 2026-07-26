// Task 9.6, Decision D19 sub-part (9): hand-written types matching
// apps/api/openapi.yaml's components/schemas exactly, field-for-field.
// Anything already exported by @tradosphere/shared-types is re-exported from
// there instead of being redeclared here (see index.ts) -- this file only
// defines what shared-types does not already own: the gateway's own error
// envelopes, and every domain type specific to auth/education/portfolio/
// analytics/cio-explainability that no service package exports on its own.

// ---- Error envelopes (every service, every 400/other JSON error) ----

export interface ErrorResponse {
  error: string;
  [key: string]: unknown;
}

export interface ValidationFailureDetail {
  path: string;
  message: string;
}

export interface ValidationFailure {
  error: string;
  details: ValidationFailureDetail[];
}

// ---- Auth ----

export type Role = 'admin' | 'trader' | 'viewer';

export interface SignupRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: Role;
  };
}

export interface MeResponse {
  id: string;
  email: string;
  role: Role;
}

export interface AdminPingResponse {
  ok: true;
}

// ---- Education ----

export type EducationContentStatus = 'draft' | 'published' | 'archived';
export type EducationSourceType = 'human' | 'ai_generated';
export type EducationDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type EducationContentType = 'glossary_term' | 'course' | 'lesson' | 'strategy' | 'quiz';
export type EducationProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
}

export interface GlossaryTerm {
  id: string;
  slug: string;
  term: string;
  definition: string;
  categoryId?: string;
  status: EducationContentStatus;
  sourceType: EducationSourceType;
  version: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryInput {
  slug: string;
  name: string;
  description?: string;
}

export interface CreateTagInput {
  slug: string;
  name: string;
}

export interface CreateGlossaryTermInput {
  slug: string;
  term: string;
  definition: string;
  categoryId?: string;
  status?: EducationContentStatus;
  sourceType?: EducationSourceType;
}

export interface UpdateGlossaryTermInput {
  term?: string;
  definition?: string;
  categoryId?: string;
  status?: EducationContentStatus;
  sourceType?: EducationSourceType;
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  categoryId?: string;
  difficulty: EducationDifficulty;
  status: EducationContentStatus;
  sourceType: EducationSourceType;
  version: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Lesson {
  id: string;
  courseId: string;
  slug: string;
  title: string;
  content: string;
  orderIndex: number;
  status: EducationContentStatus;
  sourceType: EducationSourceType;
  version: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCourseInput {
  slug: string;
  title: string;
  description: string;
  categoryId?: string;
  difficulty?: EducationDifficulty;
  status?: EducationContentStatus;
  sourceType?: EducationSourceType;
}

export interface UpdateCourseInput {
  title?: string;
  description?: string;
  categoryId?: string;
  difficulty?: EducationDifficulty;
  status?: EducationContentStatus;
  sourceType?: EducationSourceType;
}

export interface CreateLessonInput {
  slug: string;
  title: string;
  content: string;
  orderIndex?: number;
  status?: EducationContentStatus;
  sourceType?: EducationSourceType;
}

export interface UpdateLessonInput {
  title?: string;
  content?: string;
  orderIndex?: number;
  status?: EducationContentStatus;
  sourceType?: EducationSourceType;
}

export interface Strategy {
  id: string;
  slug: string;
  name: string;
  description: string;
  categoryId?: string;
  difficulty: EducationDifficulty;
  status: EducationContentStatus;
  sourceType: EducationSourceType;
  version: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStrategyInput {
  slug: string;
  name: string;
  description: string;
  categoryId?: string;
  difficulty?: EducationDifficulty;
  status?: EducationContentStatus;
  sourceType?: EducationSourceType;
}

export interface UpdateStrategyInput {
  name?: string;
  description?: string;
  categoryId?: string;
  difficulty?: EducationDifficulty;
  status?: EducationContentStatus;
  sourceType?: EducationSourceType;
}

export interface Quiz {
  id: string;
  slug: string;
  title: string;
  courseId?: string;
  lessonId?: string;
  status: EducationContentStatus;
  sourceType: EducationSourceType;
  version: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuizInput {
  slug: string;
  title: string;
  courseId?: string;
  lessonId?: string;
  status?: EducationContentStatus;
  sourceType?: EducationSourceType;
}

export interface UpdateQuizInput {
  title?: string;
  courseId?: string;
  lessonId?: string;
  status?: EducationContentStatus;
  sourceType?: EducationSourceType;
}

/** Full row including the answer key -- admin-only responses. */
export interface QuizQuestion {
  id: string;
  quizId: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation?: string;
  orderIndex: number;
  createdAt: string;
}

/** toPublicQuestion()'s redacted projection -- no answer key. */
export interface PublicQuizQuestion {
  id: string;
  quizId: string;
  question: string;
  options: string[];
  orderIndex: number;
}

export interface CreateQuizQuestionInput {
  question: string;
  options: string[];
  correctOptionIndex: number;
  explanation?: string;
  orderIndex?: number;
}

export interface UpdateQuizQuestionInput {
  question?: string;
  options?: string[];
  correctOptionIndex?: number;
  explanation?: string;
  orderIndex?: number;
}

export interface QuizAttemptAnswer {
  questionId: string;
  selectedOptionIndex: number;
  correct: boolean;
}

export interface QuizAttempt {
  id: string;
  userId: string;
  quizId: string;
  score: number;
  totalQuestions: number;
  answers: QuizAttemptAnswer[];
  completedAt: string;
}

export interface SubmitQuizAttemptAnswer {
  questionId: string;
  selectedOptionIndex: number;
}

export interface SubmitQuizAttemptInput {
  answers: SubmitQuizAttemptAnswer[];
}

export interface ContentTag {
  id: string;
  contentType: EducationContentType;
  contentId: string;
  tagId: string;
  createdAt: string;
}

export interface ContentRevision {
  id: string;
  contentType: EducationContentType;
  contentId: string;
  version: number;
  snapshot: Record<string, unknown>;
  editedBy?: string;
  createdAt: string;
}

export interface Progress {
  id: string;
  userId: string;
  contentType: EducationContentType;
  contentId: string;
  status: EducationProgressStatus;
  progressPct: number;
  lastAccessedAt: string;
  completedAt?: string;
  createdAt: string;
}

export interface AttachTagInput {
  tagId: string;
}

export interface UpsertProgressInput {
  status: EducationProgressStatus;
  progressPct?: number;
}

// TutorExplainInput/AnnotateTradeIdeaInput reference ExpertOpinion/TradeIdea
// from @tradosphere/shared-types -- declared in client.ts call sites via
// generics on the imported types directly, see education.ts.

// ---- Portfolio ----

export type PositionDirection = 'long' | 'short';

export interface Position {
  symbol: string;
  direction: PositionDirection;
  quantity: number;
  averageEntryPrice: number;
}

export interface PortfolioSnapshot {
  id: string;
  userId?: string;
  cashBalance: number;
  positionsValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalEquity: number;
  label?: string;
  asOf: string;
  createdAt: string;
}

export interface CreateSnapshotInput {
  label?: string;
  asOf?: string;
}

export interface PerformanceMetrics {
  startingCash: number;
  totalEquity: number;
  totalReturn: number;
  totalReturnPct: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface AllocationEntry {
  symbol: string;
  direction: PositionDirection;
  marketValue: number;
  allocationPct: number;
}

export interface RiskAdjustedReturns {
  sharpeRatio?: number;
  sortinoRatio?: number;
  insufficientData: boolean;
}

export interface PortfolioCashResponse {
  cashBalance: number;
  startingCash: number;
}

export interface PortfolioPnlResponse {
  realizedPnl: number;
  unrealizedPnl: number;
  missingPriceSymbols: string[];
}

export interface PortfolioSummaryResponse {
  cashBalance: number;
  positionsValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalEquity: number;
  positions: Position[];
  missingPriceSymbols: string[];
}

export interface PortfolioAllocationResponse {
  allocation: AllocationEntry[];
  missingPriceSymbols: string[];
}

export interface PortfolioRiskResponse {
  grossExposure: number;
  netExposure: number;
  leverageRatio: number;
  largestPositionPct: number;
  missingPriceSymbols: string[];
}

export interface PortfolioSnapshotConflict {
  error: string;
  missingPriceSymbols: string[];
}

// ---- Analytics ----

export type SessionWindowKey = 'h00_06' | 'h06_12' | 'h12_18' | 'h18_24';

export type DayOfWeek =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

export interface MonthBucket {
  key: string;
  year: number;
  month: number;
}

export interface MonthlyReport {
  month: MonthBucket;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  openTrades: number;
  totalRealizedPnl: number;
  winRate?: number;
  averageReturn?: number;
  averageReturnPct?: number;
  expectancy?: number;
  plannedRiskRewardRatio?: number;
  realizedRiskRewardRatio?: number;
}

export interface StrategyKey {
  key: string;
  cioVerdictLabel?: string;
  recommendedDirection?: string;
}

export interface StrategyStats {
  strategy: StrategyKey;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  openTrades: number;
  totalRealizedPnl: number;
  winRate?: number;
  averageReturn?: number;
  expectancy?: number;
}

export interface DistributionBucket {
  rangeStart: number;
  rangeEnd: number;
  count: number;
}

export interface TradeDistribution {
  buckets: DistributionBucket[];
  minPnl?: number;
  maxPnl?: number;
}

export interface HeatmapCell {
  dayOfWeek: DayOfWeek;
  session: SessionWindowKey;
  sessionLabel: string;
  totalTrades: number;
  totalRealizedPnl: number;
  winRate?: number;
}

export interface SessionStats {
  session: SessionWindowKey;
  label: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  openTrades: number;
  totalRealizedPnl: number;
  winRate?: number;
  averageReturn?: number;
}

export interface InstrumentStats {
  symbol: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  openTrades: number;
  totalRealizedPnl: number;
  winRate?: number;
  averageReturn?: number;
}

export interface FullStatSet {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  openTrades: number;
  totalRealizedPnl: number;
  winRate?: number;
  averageReturn?: number;
  averageReturnPct?: number;
  expectancy?: number;
  plannedRiskRewardRatio?: number;
  realizedRiskRewardRatio?: number;
  maxDrawdownPct?: number;
  sharpeRatio?: number;
  sortinoRatio?: number;
}

export interface AnalyticsReport extends FullStatSet {
  id: string;
  userId?: string;
  label?: string;
  fromDate?: string;
  toDate?: string;
  asOf: string;
  createdAt: string;
}

export interface CreateAnalyticsReportInput {
  label?: string;
  from?: string;
  to?: string;
  asOf?: string;
}

export interface AnalyticsDateRangeQuery {
  from?: string;
  to?: string;
}

export interface AnalyticsWinRateResponse {
  winRate: number;
}

export interface AnalyticsAverageReturnResponse {
  averageReturn: number;
  averageReturnPct: number;
}

export interface AnalyticsRiskRewardResponse {
  plannedRiskRewardRatio: number;
  realizedRiskRewardRatio: number;
}

export interface AnalyticsExpectancyResponse {
  expectancy: number;
}

export interface AnalyticsDrawdownResponse {
  maxDrawdownPct: number;
}

// ---- Research inputs (research modules take caller-supplied bars) ----
// PriceBar reuses @tradosphere/shared-types.

export interface AnalyzeTechnicalInput {
  symbol: string;
  bars: import('@tradosphere/shared-types').PriceBar[];
}

export interface AnalyzeSectorInput {
  sector: string;
  sectorBars: import('@tradosphere/shared-types').PriceBar[];
  benchmarkBars: import('@tradosphere/shared-types').PriceBar[];
  rotationThresholdPct?: number;
}

export interface AnalyzeQuantInput {
  symbol: string;
  bars: import('@tradosphere/shared-types').PriceBar[];
  period?: number;
}

// ---- AI Council synthesis inputs ----

export interface StrategyAgentInput {
  opinions: import('@tradosphere/shared-types').ExpertOpinion[];
}

export interface RiskAgentInput {
  opinions: import('@tradosphere/shared-types').ExpertOpinion[];
  volatilityAnnualizedPct?: number;
}

export interface EducationAgentInput {
  opinions: import('@tradosphere/shared-types').ExpertOpinion[];
}

export interface TutorExplainInput {
  opinions: import('@tradosphere/shared-types').ExpertOpinion[];
}

export interface AnnotateTradeIdeaInput {
  tradeIdea: import('@tradosphere/shared-types').TradeIdea;
  opinions: import('@tradosphere/shared-types').ExpertOpinion[];
}

// ---- CIO ----

export interface PortfolioRiskContext {
  currentDrawdownPct: number;
  maxDrawdownPct: number;
  currentExposurePct: number;
  maxExposurePct: number;
}

export interface BuildCioVerdictInput {
  symbol: string;
  opinions: import('@tradosphere/shared-types').ExpertOpinion[];
  referencePrice: number;
  portfolio: PortfolioRiskContext;
  dataValid: boolean;
  minConfidence?: number;
  minRiskRewardRatio?: number;
  stopLossPct?: number;
  targetRiskRewardRatio?: number;
}

export interface RiskGateMitigation {
  positionSizeMultiplier: number;
  leverageMultiplier: number;
  note: string;
}

export interface RiskGateResult {
  level: 1 | 2 | 3;
  approved: boolean;
  reasons: string[];
  mitigation?: RiskGateMitigation;
}

export interface TraceEntry {
  expert: import('@tradosphere/shared-types').ExpertName;
  verdict: import('@tradosphere/shared-types').Verdict;
  confidence: number;
  weight: number;
  included: boolean;
  contribution: number;
  reasoning: string[];
}

export interface ExplainabilityTrace {
  entries: TraceEntry[];
  consensus: {
    weightedScore: number;
    verdict: import('@tradosphere/shared-types').Verdict;
    confidence: number;
  };
  riskGate?: RiskGateResult;
  summary: string[];
}

export type CioVerdictWithTrace = import('@tradosphere/shared-types').CioVerdict & {
  trace: ExplainabilityTrace;
  riskGate: RiskGateResult;
};

// ---- Infra ----

export interface HealthResponse {
  status: string;
}

export type ServiceReachability = 'ok' | 'unreachable';

export interface HealthServicesResponse {
  auth: ServiceReachability;
  marketData: ServiceReachability;
  education: ServiceReachability;
  portfolio: ServiceReachability;
  analytics: ServiceReachability;
}
