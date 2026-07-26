import type { PortfolioSnapshotRow } from '@tradosphere/database';
import type { TradeRecordSource, TradeRecord } from '../src/trade-record-source';
import type { PriceSource, RealTimePrice } from '../src/price-source';
import type { PortfolioRepository, CreateSnapshotInput, ListHistoryOptions } from '../src/portfolio-repository';

let tradeCounter = 0;

// In-memory test double for the TradeRecordSource port -- same "test against
// the port, not the adapter" approach as services/journal/test/fakes.ts's
// InMemoryJournalRepository. addTrade is a test-only builder (the real
// JournalTradeRecordSource has no write path -- journal entries are written
// by services/journal, portfolio only ever reads them via this port), so
// every field has a sensible default and a test overrides only what the
// scenario actually needs.
export class InMemoryTradeRecordSource implements TradeRecordSource {
  private readonly trades: TradeRecord[] = [];

  addTrade(overrides: Partial<TradeRecord> = {}): TradeRecord {
    const trade: TradeRecord = {
      id: `trade-${++tradeCounter}`,
      userId: 'user-1',
      symbol: 'AAPL',
      side: 'buy',
      quantity: 10,
      fillPrice: 100,
      filledAtIso: new Date().toISOString(),
      status: 'open',
      exitPrice: null,
      exitAtIso: null,
      realizedPnl: null,
      ...overrides,
    };
    this.trades.push(trade);
    return trade;
  }

  async listByUser(userId: string): Promise<TradeRecord[]> {
    return this.trades.filter((trade) => trade.userId === userId);
  }
}

// In-memory test double for the PriceSource port -- byte-for-byte the same
// shape as services/paper-trading/test/fakes.ts's InMemoryPriceSource,
// duplicated rather than imported for the same service-isolation reasoning
// src/price-source.ts itself already documents.
export class InMemoryPriceSource implements PriceSource {
  private readonly prices = new Map<string, RealTimePrice>();

  setPrice(symbol: string, price: number, asOfIso: string): void {
    this.prices.set(symbol, { symbol, price, asOfIso });
  }

  async getLatestPrice(symbol: string): Promise<RealTimePrice | undefined> {
    return this.prices.get(symbol);
  }
}

let snapshotCounter = 0;

// In-memory test double for the PortfolioRepository port -- mirrors
// DrizzlePortfolioRepository's filtering (userId, optional fromIso/toIso
// bounds) and ordering (ascending by asOf) exactly, so a test asserting on
// InMemoryPortfolioRepository's behavior is asserting on the real contract,
// not a simplified stand-in for it.
export class InMemoryPortfolioRepository implements PortfolioRepository {
  private readonly rows: PortfolioSnapshotRow[] = [];

  async create(input: CreateSnapshotInput): Promise<PortfolioSnapshotRow> {
    const row: PortfolioSnapshotRow = {
      id: `snapshot-${++snapshotCounter}`,
      userId: input.userId ?? null,
      cashBalance: input.cashBalance,
      positionsValue: input.positionsValue,
      realizedPnl: input.realizedPnl,
      unrealizedPnl: input.unrealizedPnl,
      totalEquity: input.totalEquity,
      label: input.label ?? null,
      asOf: new Date(input.asOfIso),
      createdAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }

  async listByUser(userId: string, options: ListHistoryOptions = {}): Promise<PortfolioSnapshotRow[]> {
    let rows = this.rows.filter((row) => row.userId === userId);
    if (options.fromIso) {
      const from = new Date(options.fromIso).getTime();
      rows = rows.filter((row) => row.asOf.getTime() >= from);
    }
    if (options.toIso) {
      const to = new Date(options.toIso).getTime();
      rows = rows.filter((row) => row.asOf.getTime() <= to);
    }
    return [...rows].sort((a, b) => a.asOf.getTime() - b.asOf.getTime());
  }
}
