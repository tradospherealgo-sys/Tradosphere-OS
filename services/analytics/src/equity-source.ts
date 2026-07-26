import { asc, eq } from 'drizzle-orm';
import { portfolioSnapshots, type Database } from '@tradosphere/database';

export interface EquitySnapshotRecord {
  totalEquity: number;
  asOfIso: string;
}

// Decision D18: Analytics reads the equity curve through this local port --
// DatabaseEquitySource queries portfolio_snapshots directly via
// @tradosphere/database, never importing services/portfolio itself. Same
// D9/D12/D17 one-directional service-isolation precedent
// journal-source.ts's DatabaseJournalSource applies to journal_entries.
//
// drawdown.ts and risk-adjusted-returns.ts (Sharpe/Sortino) both need
// consecutive *period returns* derived from real snapshot-to-snapshot
// totalEquity deltas -- not a per-trade P&L series -- so this port returns
// exactly the two fields that computation needs, ordered ascending by asOf
// (oldest first), the same natural read order services/portfolio's own
// listByUser already uses for its Equity Curve / Portfolio History.
export interface EquitySnapshotSource {
  listByUser(userId: string): Promise<EquitySnapshotRecord[]>;
}

// Real adapter. Deliberately dumb: every real snapshot row for the user,
// oldest first. Returns an empty array (never a fabricated point) when the
// user has no snapshots yet -- drawdown.ts/risk-adjusted-returns.ts both
// treat "fewer than 2 snapshots" as an honest, explicit data gap rather
// than a computed 0 (Delta charter rule 5).
export class DatabaseEquitySource implements EquitySnapshotSource {
  constructor(private readonly db: Database) {}

  async listByUser(userId: string): Promise<EquitySnapshotRecord[]> {
    const rows = await this.db
      .select()
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.userId, userId))
      .orderBy(asc(portfolioSnapshots.asOf));

    return rows.map((row) => ({
      totalEquity: row.totalEquity,
      asOfIso: row.asOf.toISOString(),
    }));
  }
}
