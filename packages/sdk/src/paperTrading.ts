// Task 9.6: the single /v1/paper-trading/orders route. Nothing is persisted
// here (Decision D16) -- a Fill only becomes durable once passed to
// JournalClient#createEntry.
import type { HttpClient } from './http';
import type { Fill, OrderRequest } from '@tradosphere/shared-types';

export class PaperTradingClient {
  constructor(private readonly http: HttpClient) {}

  /** Fill price is the latest real market_ticks row for the symbol -- never a fabricated or stale-as-fresh price. */
  placeOrder(input: OrderRequest): Promise<Fill> {
    return this.http.request('POST', '/v1/paper-trading/orders', { body: input });
  }
}
