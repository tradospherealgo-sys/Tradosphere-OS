import { and, eq, gte, lte, type SQL } from 'drizzle-orm';
import { portfolioSnapshots, type Database, type PortfolioSnapshotRow } from '@tradosphere/database';

export interface CreateSnapshotInput {
  userId?: string;
  cashBalance: number;
  positionsValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalEquity: number;
  label?: string;
  asOfIso: string;
}

export interface ListHistoryOptions {
  fromIso?: string;
  toIso?: string;
}

// Port every consumer of "persist/read back a portfolio snapshot" depends
// on -- same reuse-a-port-not-a-service pattern as services/journal's
// JournalRepository and services/education's Drizzle*Repository interfaces.
// test/fakes.ts's InMemoryPortfolioRepository implements this without
// touching Postgres at all.
export interface PortfolioRepository {
  create(input: CreateSnapshotInput): Promise<PortfolioSnapshotRow>;
  listByUser(userId: string, options?: ListHistoryOptions): Promise<PortfolioSnapshotRow[]>;
}

// Real adapter. create() writes exactly the server-computed MTM result
// (mtm.ts) -- the client-supplied POST /portfolio/snapshot body only ever
// carries label/asOf (validation.ts's createSnapshotBodySchema), never a
// cash/P&L/equity figure, so a snapshot can never be fabricated or
// tampered with by a caller (Forge charter rule 2). listByUser() orders
// ascending by asOf -- the natural read order for both "Equity Curve" (a
// chart) and "Portfolio History" (a timeline), the one mechanism Decision
// D17 designed to serve both from a single table.
export class DrizzlePortfolioRepository implements PortfolioRepository {
  constructor(private readonly db: Database) {}

  async create(input: CreateSnapshotInput): Promise<PortfolioSnapshotRow> {
    const [row] = await this.db
      .insert(portfolioSnapshots)
      .values({
        userId: input.userId,
        cashBalance: input.cashBalance,
        positionsValue: input.positionsValue,
        realizedPnl: input.realizedPnl,
        unrealizedPnl: input.unrealizedPnl,
        totalEquity: input.totalEquity,
        label: input.label,
        asOf: new Date(input.asOfIso),
      })
      .returning();
    return row;
  }

  async listByUser(userId: string, options: ListHistoryOptions = {}): Promise<PortfolioSnapshotRow[]> {
    const conditions: SQL[] = [eq(portfolioSnapshots.userId, userId)];
    if (options.fromIso) conditions.push(gte(portfolioSnapshots.asOf, new Date(options.fromIso)));
    if (options.toIso) conditions.push(lte(portfolioSnapshots.asOf, new Date(options.toIso)));

    return this.db
      .select()
      .from(portfolioSnapshots)
      .where(and(...conditions))
      .orderBy(portfolioSnapshots.asOf);
  }
}
