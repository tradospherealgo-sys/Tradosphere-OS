// Task 9.6: services/market-data exposes exactly one HTTP route -- its real
// interface is the /stream WebSocket layer (GatewayStreamServer), not REST.
import type { HttpClient } from './http';
import type { HealthResponse } from './types';

export class MarketDataClient {
  constructor(private readonly http: HttpClient) {}

  health(): Promise<HealthResponse> {
    return this.http.request('GET', '/v1/market-data/health');
  }
}
