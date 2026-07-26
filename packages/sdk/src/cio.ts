// Task 9.6: the single /v1/cio/verdict route. Publishes onto
// CIO_VERDICTS_CHANNEL server-side as a side effect -- /stream subscribers
// (see GatewayStreamServer) see the same verdict this call returns.
import type { HttpClient } from './http';
import type { BuildCioVerdictInput, CioVerdictWithTrace } from './types';

export class CioClient {
  constructor(private readonly http: HttpClient) {}

  /**
   * tradeIdeas on the result is empty whenever the risk gate's Level 1 veto
   * fired (riskGate.approved === false) -- the CIO never overrides a Level 1
   * veto.
   */
  buildVerdict(input: BuildCioVerdictInput): Promise<CioVerdictWithTrace> {
    return this.http.request('POST', '/v1/cio/verdict', { body: input });
  }
}
