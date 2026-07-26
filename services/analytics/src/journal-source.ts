import { eq } from 'drizzle-orm';
import { journalEntries, type Database } from '@tradosphere/database';
import type { OrderSide, JournalEntryStatus, Verdict } from '@tradosphere/shared-types';

// Decision D18: Analytics reads trades through this local port --
// DatabaseJournalSource queries journal_entries directly via
// @tradosphere/database, never importing services/journal itself. Same
// D9/D12/D17 one-directional service-isolation precedent every other
// cross-service read in this codebase uses.
//
// Unlike Portfolio's TradeRecord (services/portfolio/src/trade-record-
// source.ts -- a narrow position/cash/pnl projection), JournalEntryRecord
// carries every field Analytics' stat modules need: the CIO recommendation
// snapshot (recommendedDirection/recommendedRiskRewardRatio/
// cioVerdictLabel, for Strategy Statistics and Planned Risk/Reward) plus
// the full outcome (status/exitPrice/exitAt/realizedPnl, for win rate/
// drawdown/expectancy/Realized R:R). Nothing here is re-derived or
// fabricated -- every field is a direct pass-through of journal_entries'
// own column. `recommendedDirection` reuses the inline 'long'/'short'
// union shared-types' own JournalEntry.recommendedDirection uses (no
// standalone TradeDirection type exists to import); `cioVerdictLabel`
// reuses shared-types' Verdict (the same type CioVerdict.verdict already
// uses) rather than inventing a parallel type for the same five values
// (reuse-before-rewrite, Forge charter rule 5).
export interface JournalEntryRecord {
  id: string;
  userId: string | null;
  symbol: string;
  side: OrderSide;
  quantity: number;
  fillPrice: number;
  filledAtIso: string;
  recommendedDirection: 'long' | 'short' | null;
  recommendedRiskRewardRatio: number | null;
  cioVerdictLabel: Verdict | null;
  status: JournalEntryStatus;
  exitPrice: number | null;
  exitAtIso: string | null;
  realizedPnl: number | null;
}

// Port every consumer of "what has this user actually traded" depends on --
// same reuse-a-port-not-a-service pattern as services/portfolio's
// TradeRecordSource. test/fakes.ts's InMemoryJournalEntrySource implements
// this interface without touching Postgres at all.
export interface JournalEntrySource {
  listByUser(userId: string): Promise<JournalEntryRecord[]>;
}

// Real adapter. Reads journal_entries -- the first (and only) point of
// persistence for a paper trade per Decision D16 -- filtered to one user.
// Never re-derives or fabricates a field journal_entries doesn't already
// have (Delta charter rule 5).
export class DatabaseJournalSource implements JournalEntrySource {
  constructor(private readonly db: Database) {}

  async listByUser(userId: string): Promise<JournalEntryRecord[]> {
    const rows = await this.db.select().from(journalEntries).where(eq(journalEntries.userId, userId));

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      symbol: row.symbol,
      side: row.side,
      quantity: row.quantity,
      fillPrice: row.fillPrice,
      filledAtIso: row.filledAt.toISOString(),
      recommendedDirection: row.recommendedDirection,
      recommendedRiskRewardRatio: row.recommendedRiskRewardRatio,
      cioVerdictLabel: row.cioVerdictLabel,
      status: row.status,
      exitPrice: row.exitPrice,
      exitAtIso: row.exitAt ? row.exitAt.toISOString() : null,
      realizedPnl: row.realizedPnl,
    }));
  }
}
