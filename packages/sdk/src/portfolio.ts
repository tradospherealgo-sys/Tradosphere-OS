// Task 9.6: all 9 /v1/portfolio routes. Portfolio and analytics self-prefix
// their own routes (`/portfolio/positions`, not just `/positions`), so the
// gateway's stripPrefix is only `/v1` for these two services (Decision D20)
// -- from the SDK's perspective as an external caller that distinction is
// invisible; every path below is exactly what openapi.yaml documents.
import type { HttpClient, QueryValue } from './http';
import type {
  AllocationEntry,
  CreateSnapshotInput,
  PerformanceMetrics,
  PortfolioAllocationResponse,
  PortfolioCashResponse,
  PortfolioPnlResponse,
  PortfolioRiskResponse,
  PortfolioSnapshot,
  PortfolioSummaryResponse,
  Position,
} from './types';

export interface PortfolioHistoryFilter {
  [key: string]: QueryValue;
  from?: string;
  to?: string;
}

export class PortfolioClient {
  constructor(private readonly http: HttpClient) {}

  positions(): Promise<{ positions: Position[] }> {
    return this.http.request('GET', '/v1/portfolio/positions');
  }
  cash(): Promise<PortfolioCashResponse> {
    return this.http.request('GET', '/v1/portfolio/cash');
  }
  pnl(): Promise<PortfolioPnlResponse> {
    return this.http.request('GET', '/v1/portfolio/pnl');
  }
  summary(): Promise<PortfolioSummaryResponse> {
    return this.http.request('GET', '/v1/portfolio/summary');
  }
  /** 409 (thrown as SdkHttpError) when required prices are missing. */
  snapshot(input: CreateSnapshotInput = {}): Promise<PortfolioSnapshot> {
    return this.http.request('POST', '/v1/portfolio/snapshot', { body: input });
  }
  history(filter: PortfolioHistoryFilter = {}): Promise<{ history: PortfolioSnapshot[] }> {
    return this.http.request('GET', '/v1/portfolio/history', { query: filter });
  }
  performance(): Promise<PerformanceMetrics> {
    return this.http.request('GET', '/v1/portfolio/performance');
  }
  allocation(): Promise<PortfolioAllocationResponse> {
    return this.http.request('GET', '/v1/portfolio/allocation');
  }
  risk(): Promise<PortfolioRiskResponse> {
    return this.http.request('GET', '/v1/portfolio/risk');
  }
}

// Re-export for callers that only need the allocation entry shape.
export type { AllocationEntry };
