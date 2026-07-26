// Task 9.6, Decision D19 sub-part (9): composes every domain module behind
// one TradosphereClient, the SDK's single public entry point. Callers
// construct exactly one client per baseUrl/token-source pair and reach every
// one of the gateway's 74 routes through its named sub-clients -- nothing in
// consumer code ever builds a URL or calls fetch directly.
import { HttpClient } from './http';
import type { SdkConfig } from './http';
import { AuthClient } from './auth';
import { MarketDataClient } from './marketData';
import { EducationClient } from './education';
import { PortfolioClient } from './portfolio';
import { AnalyticsClient } from './analytics';
import { ResearchClient } from './research';
import { AiCouncilClient } from './ai';
import { CioClient } from './cio';
import { PaperTradingClient } from './paperTrading';
import { JournalClient } from './journal';
import { InfraClient } from './infra';

export class TradosphereClient {
  readonly auth: AuthClient;
  readonly marketData: MarketDataClient;
  readonly education: EducationClient;
  readonly portfolio: PortfolioClient;
  readonly analytics: AnalyticsClient;
  readonly research: ResearchClient;
  readonly ai: AiCouncilClient;
  readonly cio: CioClient;
  readonly paperTrading: PaperTradingClient;
  readonly journal: JournalClient;
  readonly infra: InfraClient;

  constructor(config: SdkConfig) {
    const http = new HttpClient(config);
    this.auth = new AuthClient(http);
    this.marketData = new MarketDataClient(http);
    this.education = new EducationClient(http);
    this.portfolio = new PortfolioClient(http);
    this.analytics = new AnalyticsClient(http);
    this.research = new ResearchClient(http);
    this.ai = new AiCouncilClient(http);
    this.cio = new CioClient(http);
    this.paperTrading = new PaperTradingClient(http);
    this.journal = new JournalClient(http);
    this.infra = new InfraClient(http);
  }
}
