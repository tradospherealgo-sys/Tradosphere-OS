import { randomUUID } from 'node:crypto';
import type { AnalyticsReportRow } from '@tradosphere/database';
import type { JournalEntrySource, JournalEntryRecord } from '../src/journal-source';
import type { EquitySnapshotSource, EquitySnapshotRecord } from '../src/equity-source';
import type { AnalyticsRepository, CreateReportInput, ListReportsOptions } from '../src/analytics-repository';

let entryCounter = 0;

// In-memory test double for the JournalEntrySource port -- same "test
// against the port, not the adapter" approach as services/portfolio/test/
// fakes.ts's InMemoryTradeRecordSource. addEntry is a test-only builder (the
// real DatabaseJournalSource has no write path -- journal entries are
// written by services/journal, analytics only ever reads them via this
// port), so every field has a sensible default and a test overrides only
// what the scenario actually needs.
export class InMemoryJournalEntrySource implements JournalEntrySource {
  private readonly entries: JournalEntryRecord[] = [];

  addEntry(overrides: Partial<JournalEntryRecord> = {}): JournalEntryRecord {
    const entry: JournalEntryRecord = {
      id: `entry-${++entryCounter}`,
      userId: 'user-1',
      symbol: 'AAPL',
      side: 'buy',
      quantity: 10,
      fillPrice: 100,
      filledAtIso: new Date().toISOString(),
      recommendedDirection: null,
      recommendedRiskRewardRatio: null,
      cioVerdictLabel: null,
      status: 'open',
      exitPrice: null,
      exitAtIso: null,
      realizedPnl: null,
      ...overrides,
    };
    this.entries.push(entry);
    return entry;
  }

  async listByUser(userId: string): Promise<JournalEntryRecord[]> {
    return this.entries.filter((entry) => entry.userId === userId);
  }
}

// EquitySnapshotRecord itself carries no userId (DatabaseEquitySource
// already scopes to one user before returning it) -- this internal shape
// adds userId purely so the fake can filter, then strips it back off in
// listByUser() below, keeping the returned shape identical to the real
// adapter's.
interface StoredSnapshot extends EquitySnapshotRecord {
  userId: string;
}

// In-memory test double for the EquitySnapshotSource port. listByUser()
// mirrors DatabaseEquitySource's real ordering contract exactly (ascending
// by asOf, oldest first) -- so a test asserting on this fake's behavior is
// asserting on the real contract drawdown.ts/risk-adjusted-returns.ts both
// depend on, not a simplified stand-in for it.
export class InMemoryEquitySnapshotSource implements EquitySnapshotSource {
  private readonly snapshots: StoredSnapshot[] = [];

  addSnapshot(overrides: Partial<StoredSnapshot> = {}): StoredSnapshot {
    const snapshot: StoredSnapshot = {
      userId: 'user-1',
      totalEquity: 100_000,
      asOfIso: new Date().toISOString(),
      ...overrides,
    };
    this.snapshots.push(snapshot);
    return snapshot;
  }

  async listByUser(userId: string): Promise<EquitySnapshotRecord[]> {
    return this.snapshots
      .filter((snapshot) => snapshot.userId === userId)
      .sort((a, b) => new Date(a.asOfIso).getTime() - new Date(b.asOfIso).getTime())
      .map(({ totalEquity, asOfIso }) => ({ totalEquity, asOfIso }));
  }
}

// In-memory test double for the AnalyticsRepository port -- mirrors
// DrizzleAnalyticsRepository's filtering (userId, optional fromIso/toIso
// bounds against the report's own asOf) and ordering (descending by asOf,
// most-recent-first) exactly, plus getById's structural id+userId
// ownership check, same "test against the real contract" reasoning
// services/portfolio's InMemoryPortfolioRepository already establishes.
// id is a real random UUID (via randomUUID()), mirroring
// analytics-schema.ts's `uuid('id').primaryKey().defaultRandom()` -- the
// real adapter never produces a non-UUID id, so the fake must not either
// (routes validate :id params as UUIDs; a fake id like "report-1" would
// fail that validation before ever reaching the repository).
export class InMemoryAnalyticsRepository implements AnalyticsRepository {
  private readonly rows: AnalyticsReportRow[] = [];

  async create(input: CreateReportInput): Promise<AnalyticsReportRow> {
    const row: AnalyticsReportRow = {
      id: randomUUID(),
      userId: input.userId ?? null,
      label: input.label ?? null,
      fromDate: input.fromIso ? new Date(input.fromIso) : null,
      toDate: input.toIso ? new Date(input.toIso) : null,
      totalTrades: input.totalTrades,
      winningTrades: input.winningTrades,
      losingTrades: input.losingTrades,
      breakevenTrades: input.breakevenTrades,
      openTrades: input.openTrades,
      totalRealizedPnl: input.totalRealizedPnl,
      winRate: input.winRate,
      averageReturn: input.averageReturn,
      averageReturnPct: input.averageReturnPct,
      expectancy: input.expectancy,
      plannedRiskRewardRatio: input.plannedRiskRewardRatio,
      realizedRiskRewardRatio: input.realizedRiskRewardRatio,
      maxDrawdownPct: input.maxDrawdownPct,
      sharpeRatio: input.sharpeRatio,
      sortinoRatio: input.sortinoRatio,
      asOf: new Date(input.asOfIso),
      createdAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }

  async listByUser(userId: string, options: ListReportsOptions = {}): Promise<AnalyticsReportRow[]> {
    let rows = this.rows.filter((row) => row.userId === userId);
    if (options.fromIso) {
      const from = new Date(options.fromIso).getTime();
      rows = rows.filter((row) => row.asOf.getTime() >= from);
    }
    if (options.toIso) {
      const to = new Date(options.toIso).getTime();
      rows = rows.filter((row) => row.asOf.getTime() <= to);
    }
    return [...rows].sort((a, b) => b.asOf.getTime() - a.asOf.getTime());
  }

  async getById(id: string, userId: string): Promise<AnalyticsReportRow | null> {
    return this.rows.find((row) => row.id === id && row.userId === userId) ?? null;
  }
}
