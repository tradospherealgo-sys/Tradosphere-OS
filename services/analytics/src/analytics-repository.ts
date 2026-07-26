import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { analyticsReports, type Database, type AnalyticsReportRow } from '@tradosphere/database';

// The full server-computed stat set a report persists -- exactly the same
// fields analytics-schema.ts's analyticsReports table has (excluding id/
// createdAt, which the database assigns) and exactly the same fields
// app.ts's computeFullStatSet() produces for GET /analytics/performance, so
// POST /analytics/reports can never disagree with what a live /performance
// call would have said at that moment. Every ratio is `number | null` --
// never a fabricated 0 when trade-stats.ts/risk-reward.ts/expectancy.ts/
// drawdown.ts/risk-adjusted-returns.ts themselves returned null for
// insufficient data (Delta charter rule 5).
export interface CreateReportInput {
  userId?: string;
  label?: string;
  fromIso?: string;
  toIso?: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  openTrades: number;
  totalRealizedPnl: number;
  winRate: number | null;
  averageReturn: number | null;
  averageReturnPct: number | null;
  expectancy: number | null;
  plannedRiskRewardRatio: number | null;
  realizedRiskRewardRatio: number | null;
  maxDrawdownPct: number | null;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  asOfIso: string;
}

export interface ListReportsOptions {
  fromIso?: string;
  toIso?: string;
}

// Port every consumer of "persist/read back an analytics report" depends
// on -- same reuse-a-port-not-a-service pattern as services/portfolio's
// PortfolioRepository. test/fakes.ts's InMemoryAnalyticsRepository
// implements this without touching Postgres at all.
export interface AnalyticsRepository {
  create(input: CreateReportInput): Promise<AnalyticsReportRow>;
  listByUser(userId: string, options?: ListReportsOptions): Promise<AnalyticsReportRow[]>;
  getById(id: string, userId: string): Promise<AnalyticsReportRow | null>;
}

// Real adapter. create() writes exactly the server-computed stat set --
// the caller's POST /analytics/reports body can only ever supply
// label/from/to/asOf (validation.ts's createReportBodySchema), never a stat
// column (Forge charter rule 2). listByUser() orders descending by asOf --
// most-recent-report-first is the natural "Reports" list read order, the
// opposite of portfolio_snapshots' ascending Equity Curve order, because a
// report list is browsed newest-first rather than charted left-to-right.
// getById() filters by id AND userId in the same query -- so an id
// belonging to another user is indistinguishable from an id that doesn't
// exist at all, the structural guarantee errors.ts's ReportNotFoundError
// doc comment relies on.
export class DrizzleAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly db: Database) {}

  async create(input: CreateReportInput): Promise<AnalyticsReportRow> {
    const [row] = await this.db
      .insert(analyticsReports)
      .values({
        userId: input.userId,
        label: input.label,
        fromDate: input.fromIso ? new Date(input.fromIso) : undefined,
        toDate: input.toIso ? new Date(input.toIso) : undefined,
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
      })
      .returning();
    return row;
  }

  async listByUser(userId: string, options: ListReportsOptions = {}): Promise<AnalyticsReportRow[]> {
    const conditions: SQL[] = [eq(analyticsReports.userId, userId)];
    if (options.fromIso) conditions.push(gte(analyticsReports.asOf, new Date(options.fromIso)));
    if (options.toIso) conditions.push(lte(analyticsReports.asOf, new Date(options.toIso)));

    return this.db
      .select()
      .from(analyticsReports)
      .where(and(...conditions))
      .orderBy(desc(analyticsReports.asOf));
  }

  async getById(id: string, userId: string): Promise<AnalyticsReportRow | null> {
    const [row] = await this.db
      .select()
      .from(analyticsReports)
      .where(and(eq(analyticsReports.id, id), eq(analyticsReports.userId, userId)));
    return row ?? null;
  }
}
