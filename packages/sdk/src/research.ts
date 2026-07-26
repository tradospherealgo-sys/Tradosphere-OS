// Task 9.6: all 5 /v1/research routes. Every result type is a discriminated
// "ok | gap" union already exported by @tradosphere/shared-types
// (TechnicalAnalysisResult, OptionAnalysisResult, etc.) -- the SDK doesn't
// redeclare them, only the caller-supplied *Input shapes research modules
// don't otherwise expose.
import type { HttpClient } from './http';
import type { AnalyzeQuantInput, AnalyzeSectorInput, AnalyzeTechnicalInput } from './types';
import type {
  FundamentalAnalysisResult,
  OptionAnalysisResult,
  OptionChainSnapshot,
  QuantAnalysisResult,
  SectorAnalysisResult,
  TechnicalAnalysisResult,
} from '@tradosphere/shared-types';

export class ResearchClient {
  constructor(private readonly http: HttpClient) {}

  analyzeTechnical(input: AnalyzeTechnicalInput): Promise<TechnicalAnalysisResult> {
    return this.http.request('POST', '/v1/research/technical', { body: input });
  }
  analyzeOptions(input: OptionChainSnapshot): Promise<OptionAnalysisResult> {
    return this.http.request('POST', '/v1/research/options', { body: input });
  }
  /** Reads the most recently ingested fundamentals verdict -- no live fetch. */
  fundamentals(symbol: string): Promise<FundamentalAnalysisResult> {
    return this.http.request('GET', `/v1/research/fundamentals/${encodeURIComponent(symbol)}`);
  }
  analyzeSector(input: AnalyzeSectorInput): Promise<SectorAnalysisResult> {
    return this.http.request('POST', '/v1/research/sector', { body: input });
  }
  analyzeQuant(input: AnalyzeQuantInput): Promise<QuantAnalysisResult> {
    return this.http.request('POST', '/v1/research/quant', { body: input });
  }
}
