// Task 9.6: all 9 /v1/ai/agents/* routes (AI Council). Six take a single
// research *AnalysisResult; three (strategy/risk/education) synthesize over
// caller-supplied ExpertOpinion arrays. indices deliberately reuses
// TechnicalAnalysisResult per Decision D7 -- there is no separate indices
// research module.
import type { HttpClient } from './http';
import type { EducationAgentInput, RiskAgentInput, StrategyAgentInput } from './types';
import type {
  ExpertOpinion,
  FundamentalAnalysisResult,
  OptionAnalysisResult,
  QuantAnalysisResult,
  SectorAnalysisResult,
  TechnicalAnalysisResult,
} from '@tradosphere/shared-types';

export class AiCouncilClient {
  constructor(private readonly http: HttpClient) {}

  technical(input: TechnicalAnalysisResult): Promise<ExpertOpinion> {
    return this.http.request('POST', '/v1/ai/agents/technical', { body: input });
  }
  options(input: OptionAnalysisResult): Promise<ExpertOpinion> {
    return this.http.request('POST', '/v1/ai/agents/options', { body: input });
  }
  sector(input: SectorAnalysisResult): Promise<ExpertOpinion> {
    return this.http.request('POST', '/v1/ai/agents/sector', { body: input });
  }
  quant(input: QuantAnalysisResult): Promise<ExpertOpinion> {
    return this.http.request('POST', '/v1/ai/agents/quant', { body: input });
  }
  fundamental(input: FundamentalAnalysisResult): Promise<ExpertOpinion> {
    return this.http.request('POST', '/v1/ai/agents/fundamental', { body: input });
  }
  /** Decision D7: delegates to the Technical agent's own interpretation, relabeled. */
  indices(input: TechnicalAnalysisResult): Promise<ExpertOpinion> {
    return this.http.request('POST', '/v1/ai/agents/indices', { body: input });
  }
  /** Returns a neutral, 0-confidence opinion if opinions is empty rather than failing. */
  strategy(input: StrategyAgentInput): Promise<ExpertOpinion> {
    return this.http.request('POST', '/v1/ai/agents/strategy', { body: input });
  }
  risk(input: RiskAgentInput): Promise<ExpertOpinion> {
    return this.http.request('POST', '/v1/ai/agents/risk', { body: input });
  }
  education(input: EducationAgentInput): Promise<ExpertOpinion> {
    return this.http.request('POST', '/v1/ai/agents/education', { body: input });
  }
}
