import type { PriceSource, RealTimePrice } from '../src/price-source';

// In-memory test double for the PriceSource port -- same "test against the
// port, not the adapter" approach as services/market-data/test/fakes.ts's
// InMemoryMarketDataRepository and services/education/test/fakes.ts.
export class InMemoryPriceSource implements PriceSource {
  private readonly prices = new Map<string, RealTimePrice>();

  setPrice(symbol: string, price: number, asOfIso: string): void {
    this.prices.set(symbol, { symbol, price, asOfIso });
  }

  async getLatestPrice(symbol: string): Promise<RealTimePrice | undefined> {
    return this.prices.get(symbol);
  }
}
