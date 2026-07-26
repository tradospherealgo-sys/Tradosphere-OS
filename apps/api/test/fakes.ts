import type { JournalEntryRow } from '@tradosphere/database';
import type { CreateJournalEntryInput, RecordOutcomeInput } from '@tradosphere/shared-types';
import type { JournalRepository } from '@tradosphere/service-journal';
import { NotFoundError, AlreadyClosedError } from '@tradosphere/service-journal';
import { validateOutcome, calculateRealizedPnl } from '@tradosphere/service-journal';
import type { PriceSource, RealTimePrice } from '@tradosphere/service-paper-trading';
import type { FundamentalsRepository, InsertResult } from '@tradosphere/service-research';
import type { CompanyFundamentalsRow } from '@tradosphere/database';
import type { CompanyFinancials } from '@tradosphere/service-research';
import type { EventBus, EventHandler, Unsubscribe } from '@tradosphere/event-bus';

// Task 9.15: apps/api's own test doubles for the four ports buildApp's
// AppDeps requires beyond the five proxied targets (app.ts). Each mirrors
// (in the InMemoryPriceSource/InMemoryJournalRepository cases, duplicates
// byte-for-byte, per the same service-isolation reasoning
// services/portfolio/test/fakes.ts's own header comment already documents)
// the canonical in-memory double for that port, so a test asserting against
// these fakes is asserting against the same contract the real Drizzle/
// database-backed adapter honors -- not a simplified stand-in for it.

// ---------------------------------------------------------------------------
// PriceSource -- byte-for-byte the same shape as
// services/paper-trading/test/fakes.ts's and
// services/portfolio/test/fakes.ts's own InMemoryPriceSource.
// ---------------------------------------------------------------------------
export class InMemoryPriceSource implements PriceSource {
  private readonly prices = new Map<string, RealTimePrice>();

  setPrice(symbol: string, price: number, asOfIso: string): void {
    this.prices.set(symbol, { symbol, price, asOfIso });
  }

  async getLatestPrice(symbol: string): Promise<RealTimePrice | undefined> {
    return this.prices.get(symbol);
  }
}

// ---------------------------------------------------------------------------
// FundamentalsRepository -- only the read path (getLatestBySymbol) is ever
// exercised through the gateway (GET /v1/research/fundamentals/{symbol});
// insertFinancials exists solely to satisfy the port's shape, exactly as
// the real DrizzleFundamentalsRepository implements both but only ingestion
// jobs call the write side.
// ---------------------------------------------------------------------------
export class InMemoryFundamentalsRepository implements FundamentalsRepository {
  private readonly rowsBySymbol = new Map<string, CompanyFundamentalsRow[]>();
  private idCounter = 0;

  // Test-only seeding helper -- the real adapter's insertFinancials()
  // computes these same fields from CompanyFinancials via Drizzle's insert;
  // this fake short-circuits straight to the row shape the route actually
  // reads (id/ingestedAt included) so tests can set up fixtures directly.
  seed(row: Partial<CompanyFundamentalsRow> & { symbol: string }): CompanyFundamentalsRow {
    const full: CompanyFundamentalsRow = {
      id: row.id ?? `fundamentals-${++this.idCounter}`,
      symbol: row.symbol,
      reportingPeriod: row.reportingPeriod ?? 'FY2026Q2',
      peRatio: row.peRatio ?? 20,
      debtToEquity: row.debtToEquity ?? 0.5,
      revenueGrowthYoyPct: row.revenueGrowthYoyPct ?? 10,
      netProfitMarginPct: row.netProfitMarginPct ?? 15,
      ingestedAt: row.ingestedAt ?? new Date(),
    };
    const existing = this.rowsBySymbol.get(row.symbol) ?? [];
    existing.push(full);
    this.rowsBySymbol.set(row.symbol, existing);
    return full;
  }

  async insertFinancials(records: CompanyFinancials[]): Promise<InsertResult> {
    for (const r of records) {
      this.seed({ ...r, id: `fundamentals-${++this.idCounter}`, ingestedAt: new Date() });
    }
    return { requested: records.length, inserted: records.length, skipped: 0 };
  }

  async getLatestBySymbol(symbol: string): Promise<CompanyFundamentalsRow | undefined> {
    const rows = this.rowsBySymbol.get(symbol);
    if (!rows || rows.length === 0) return undefined;
    // Most recently ingested first, mirroring DrizzleFundamentalsRepository's
    // `orderBy(desc(ingestedAt)).limit(1)`.
    return [...rows].sort((a, b) => b.ingestedAt.getTime() - a.ingestedAt.getTime())[0];
  }
}

// ---------------------------------------------------------------------------
// JournalRepository -- byte-for-byte the same shape as
// services/journal/test/fakes.ts's own InMemoryJournalRepository, duplicated
// (not imported) for the same reason InMemoryPriceSource is duplicated
// above: apps/api never reaches into a service's own test/ directory.
// ---------------------------------------------------------------------------
let journalCounter = 0;

export class InMemoryJournalRepository implements JournalRepository {
  private readonly rows = new Map<string, JournalEntryRow>();

  async create(input: CreateJournalEntryInput): Promise<JournalEntryRow> {
    const { fill, tradeIdea, cioVerdict } = input;
    const row: JournalEntryRow = {
      id: `journal-${++journalCounter}`,
      userId: input.userId ?? null,
      symbol: fill.symbol,
      side: fill.side,
      quantity: fill.quantity,
      fillPrice: fill.price,
      filledAt: new Date(fill.filledAtIso),
      priceAsOf: new Date(fill.priceAsOfIso),
      recommendedDirection: tradeIdea?.direction ?? null,
      recommendedEntry: tradeIdea?.entry ?? null,
      recommendedStopLoss: tradeIdea?.stopLoss ?? null,
      recommendedTarget: tradeIdea?.target ?? null,
      recommendedRiskRewardRatio: tradeIdea?.riskRewardRatio ?? null,
      cioVerdictLabel: cioVerdict?.verdict ?? null,
      cioConfidence: cioVerdict?.confidence ?? null,
      educationNote: tradeIdea?.educationNote ?? null,
      recommendationGeneratedAt: cioVerdict ? new Date(cioVerdict.generatedAtIso) : null,
      status: 'open',
      exitPrice: null,
      exitAt: null,
      realizedPnl: null,
      createdAt: new Date(),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async getById(id: string): Promise<JournalEntryRow | undefined> {
    return this.rows.get(id);
  }

  async listByUser(userId: string): Promise<JournalEntryRow[]> {
    return [...this.rows.values()].filter((row) => row.userId === userId);
  }

  async recordOutcome(id: string, outcome: RecordOutcomeInput): Promise<JournalEntryRow> {
    validateOutcome(outcome);

    const current = this.rows.get(id);
    if (!current) throw new NotFoundError(id);
    if (current.status === 'closed') throw new AlreadyClosedError(id);

    const realizedPnl = calculateRealizedPnl(current.side, current.quantity, current.fillPrice, outcome.exitPrice);
    const updated: JournalEntryRow = {
      ...current,
      status: 'closed',
      exitPrice: outcome.exitPrice,
      exitAt: new Date(outcome.exitAtIso),
      realizedPnl,
    };
    this.rows.set(id, updated);
    return updated;
  }
}

// ---------------------------------------------------------------------------
// EventBus -- no precedent exists anywhere in the repo (every other test
// suite either doesn't need one or drives RedisEventBus with two
// ioredis-mock instances, e.g. packages/event-bus's own tests). apps/api is
// the first consumer to both publish (POST /v1/cio/verdict) and subscribe
// (GatewayStreamServer) within the same process, so a genuinely in-memory,
// synchronous-dispatch double is written fresh here: publish() looks up
// every handler currently subscribed to the channel and invokes it directly,
// with no network hop and no serialization round-trip. Good enough to prove
// the gateway's own publish-then-broadcast wiring; it is not a stand-in for
// RedisEventBus's own cross-process behavior, which is already covered by
// packages/event-bus's own test suite.
// ---------------------------------------------------------------------------
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler<unknown>>>();
  readonly published: Array<{ channel: string; payload: unknown }> = [];

  async publish<T>(channel: string, payload: T): Promise<void> {
    this.published.push({ channel, payload });
    const set = this.handlers.get(channel);
    if (!set) return;
    for (const handler of set) {
      await handler(payload);
    }
  }

  async subscribe<T>(channel: string, handler: EventHandler<T>): Promise<Unsubscribe> {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler as EventHandler<unknown>);
    return async () => {
      set!.delete(handler as EventHandler<unknown>);
    };
  }

  async close(): Promise<void> {
    this.handlers.clear();
  }
}
