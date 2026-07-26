// Task 9.6: all 15 /v1/analytics routes.
import type { HttpClient, QueryValue } from './http';
import type {
  AnalyticsAverageReturnResponse,
  AnalyticsDrawdownResponse,
  AnalyticsExpectancyResponse,
  AnalyticsReport,
  AnalyticsRiskRewardResponse,
  AnalyticsWinRateResponse,
  CreateAnalyticsReportInput,
  FullStatSet,
  HeatmapCell,
  InstrumentStats,
  MonthlyReport,
  RiskAdjustedReturns,
  SessionStats,
  StrategyStats,
  TradeDistribution,
} from './types';

export interface AnalyticsDateRangeFilter {
  [key: string]: QueryValue;
  from?: string;
  to?: string;
}

export interface AnalyticsTradeDistributionFilter extends AnalyticsDateRangeFilter {
  /** Overrides the default of 10 equal-width buckets. 1-100. */
  buckets?: number;
}

export class AnalyticsClient {
  constructor(private readonly http: HttpClient) {}

  winRate(filter: AnalyticsDateRangeFilter = {}): Promise<AnalyticsWinRateResponse> {
    return this.http.request('GET', '/v1/analytics/win-rate', { query: filter });
  }
  averageReturn(filter: AnalyticsDateRangeFilter = {}): Promise<AnalyticsAverageReturnResponse> {
    return this.http.request('GET', '/v1/analytics/average-return', { query: filter });
  }
  riskReward(filter: AnalyticsDateRangeFilter = {}): Promise<AnalyticsRiskRewardResponse> {
    return this.http.request('GET', '/v1/analytics/risk-reward', { query: filter });
  }
  expectancy(filter: AnalyticsDateRangeFilter = {}): Promise<AnalyticsExpectancyResponse> {
    return this.http.request('GET', '/v1/analytics/expectancy', { query: filter });
  }
  drawdown(filter: AnalyticsDateRangeFilter = {}): Promise<AnalyticsDrawdownResponse> {
    return this.http.request('GET', '/v1/analytics/drawdown', { query: filter });
  }
  riskAdjustedReturns(filter: AnalyticsDateRangeFilter = {}): Promise<RiskAdjustedReturns> {
    return this.http.request('GET', '/v1/analytics/risk-adjusted-returns', { query: filter });
  }
  performance(filter: AnalyticsDateRangeFilter = {}): Promise<FullStatSet> {
    return this.http.request('GET', '/v1/analytics/performance', { query: filter });
  }
  monthlyReports(filter: AnalyticsDateRangeFilter = {}): Promise<{ reports: MonthlyReport[] }> {
    return this.http.request('GET', '/v1/analytics/monthly-reports', { query: filter });
  }
  strategyStats(filter: AnalyticsDateRangeFilter = {}): Promise<{ strategies: StrategyStats[] }> {
    return this.http.request('GET', '/v1/analytics/strategy-stats', { query: filter });
  }
  tradeDistribution(filter: AnalyticsTradeDistributionFilter = {}): Promise<TradeDistribution> {
    return this.http.request('GET', '/v1/analytics/trade-distribution', { query: filter });
  }
  /** Always 28 cells (7 days x 4 sessions), even when a cell has zero trades. */
  heatmap(filter: AnalyticsDateRangeFilter = {}): Promise<{ cells: HeatmapCell[] }> {
    return this.http.request('GET', '/v1/analytics/heatmap', { query: filter });
  }
  sessionAnalysis(filter: AnalyticsDateRangeFilter = {}): Promise<{ sessions: SessionStats[] }> {
    return this.http.request('GET', '/v1/analytics/session-analysis', { query: filter });
  }
  instrumentAnalysis(filter: AnalyticsDateRangeFilter = {}): Promise<{ instruments: InstrumentStats[] }> {
    return this.http.request('GET', '/v1/analytics/instrument-analysis', { query: filter });
  }
  /** Persists exactly the stat set GET /performance would return right now. */
  createReport(input: CreateAnalyticsReportInput = {}): Promise<AnalyticsReport> {
    return this.http.request('POST', '/v1/analytics/reports', { body: input });
  }
  /** Filters by each report's own asOf, not the range it covers. Newest first. */
  listReports(filter: AnalyticsDateRangeFilter = {}): Promise<{ reports: AnalyticsReport[] }> {
    return this.http.request('GET', '/v1/analytics/reports', { query: filter });
  }
  getReport(id: string): Promise<AnalyticsReport> {
    return this.http.request('GET', `/v1/analytics/reports/${encodeURIComponent(id)}`);
  }
}
