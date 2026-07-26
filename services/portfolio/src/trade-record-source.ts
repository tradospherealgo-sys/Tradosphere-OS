import { eq } from 'drizzle-orm';
import { journalEntries, type Database } from '@tradosphere/database';
import type { OrderSide, JournalEntryStatus } from '@tradosphere/shared-types';

// Decision D17: Portfolio reads trades through this local port --
// JournalTradeRecordSource queries journal_entries directly via
// @tradosphere/database, never importing services/journal itself. This
// preserves the D9/D12 one-directional service-isolation precedent (a
// service reads another service's table through the shared database
// package, never through the other service's code) while still letting
// Portfolio see every trade services/journal has recorded.
//
// TradeRecord is a deliberately narrow projection of JournalEntryRow --
// only the fields positions.ts/cash.ts/pnl.ts actually need. `side` and
// `status` reuse shared-types' own OrderSide/JournalEntryStatus rather than
// inventing parallel types for the same two values (reuse-before-rewrite,
// Forge charter rule 5). `direction` is derived from `side` in positions.ts
// (buy -> long/+1, sell -> short/-1) rather than from
// journal_entries.recommended_direction, which is the CIO's nullable
// *suggestion* and may be absent or differ from what actually executed --
// the real fill's own side is the only non-nullable source of truth for
// what position it actually opened.
export interface TradeRecord {
  id: string;
  userId: string | null;
  symbol: string;
  side: OrderSide;
  quantity: number;
  fillPrice: number;
  filledAtIso: string;
  status: JournalEntryStatus;
  exitPrice: number | null;
  exitAtIso: string | null;
  realizedPnl: number | null;
}

// Port every consumer of "what trades has this user made" depends on -- same
// reuse-a-port-not-a-service pattern as price-source.ts's PriceSource.
// test/fakes.ts's InMemoryTradeRecordSource implements this interface
// without touching Postgres at all.
export interface TradeRecordSource {
  listByUser(userId: string): Promise<TradeRecord[]>;
}

// Real adapter. Reads journal_entries -- the first (and only) point of
// persistence for a paper trade per Decision D16 -- filtered to one user.
// Never re-derives or fabricates a field journal_entries doesn't already
// have (Delta charter rule 5).
export class JournalTradeRecordSource implements TradeRecordSource {
  constructor(private readonly db: Database) {}

  async listByUser(userId: string): Promise<TradeRecord[]> {
    const rows = await this.db.select().from(journalEntries).where(eq(journalEntries.userId, userId));

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      symbol: row.symbol,
      side: row.side,
      quantity: row.quantity,
      fillPrice: row.fillPrice,
      filledAtIso: row.filledAt.toISOString(),
      status: row.status,
      exitPrice: row.exitPrice,
      exitAtIso: row.exitAt ? row.exitAt.toISOString() : null,
      realizedPnl: row.realizedPnl,
    }));
  }
}
