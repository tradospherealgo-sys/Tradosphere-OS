// Task 9.6: the six unversioned infra routes. /health and /health/services
// are JSON; /metrics (Prometheus text), /openapi.yaml (YAML), and
// /documentation (HTML) are all plain text and go through
// HttpClient#requestText instead of #request so JSON.parse never runs
// against a non-JSON body. /stream is a WebSocket upgrade, not a normal
// HTTP call -- deliberately not wrapped here; connect a WebSocket client to
// `${baseUrl.replace(/^http/, 'ws')}/stream` directly.
import type { HttpClient } from './http';
import type { HealthResponse, HealthServicesResponse } from './types';

export class InfraClient {
  constructor(private readonly http: HttpClient) {}

  health(): Promise<HealthResponse> {
    return this.http.request('GET', '/health', { skipAuth: true });
  }

  /** Pings each proxied service's own /health; in-process domains aren't checked (nothing to be unreachable from). */
  healthServices(): Promise<HealthServicesResponse> {
    return this.http.request('GET', '/health/services', { skipAuth: true });
  }

  /** Prometheus text-format exposition -- prom-client defaults plus http_requests_total / http_request_duration_seconds. */
  metrics(): Promise<string> {
    return this.http.requestText('/metrics');
  }

  /** The hand-authored spec itself, served as static YAML text. */
  openApiSpec(): Promise<string> {
    return this.http.requestText('/openapi.yaml');
  }

  /** Swagger UI HTML page (loads the CDN bundle, points at /openapi.yaml). */
  documentationPage(): Promise<string> {
    return this.http.requestText('/documentation');
  }
}
