import { and, eq } from 'drizzle-orm';
import { journalEntries, type Database, type JournalEntryRow } from '@tradosphere/database';
import type { CreateJournalEntryInput, RecordOutcomeInput } from '@tradosphere/shared-types';
import { NotFoundError, AlreadyClosedError } from './errors';
import { validateOutcome, calculateRealizedPnl } from './pnl';

// Port every consumer of "create/read/close a journal entry" depends on --
// same reuse-a-port-not-a-service pattern as services/paper-trading's
// PriceSource and services/education's Drizzle*Repository interfaces.
// test/fakes.ts's InMemoryJournalRepository implements this without
// touching Postgres at all, calling the exact same pnl.ts rules.
export interface JournalRepository {
  create(input: CreateJournalEntryInput): Promise<JournalEntryRow>;
  getById(id: string): Promise<JournalEntryRow | undefined>;
  listByUser(userId: string): Promise<JournalEntryRow[]>;
  recordOutcome(id: string, outcome: RecordOutcomeInput): Promise<JournalEntryRow>;
}

// Real adapter. Decision D16: journal_entries is the FIRST point of
// persistence for a paper trade -- create() snapshots the real Fill (task
// 8.1) plus whatever TradeIdea/CioVerdict recommendation it was based on,
// exactly as generated, never re-derived later. Every recommended*/cio*
// field is left undefined (not a fabricated default) when its source input
// is absent, per Delta charter rule 5.
export class DrizzleJournalRepository implements JournalRepository {
  constructor(private readonly db: Database) {}

  async create(input: CreateJournalEntryInput): Promise<JournalEntryRow> {
    const { fill, tradeIdea, cioVerdict } = input;
    const [row] = await this.db
      .insert(journalEntries)
      .values({
        userId: input.userId,
        symbol: fill.symbol,
        side: fill.side,
        quantity: fill.quantity,
        fillPrice: fill.price,
        filledAt: new Date(fill.filledAtIso),
        priceAsOf: new Date(fill.priceAsOfIso),
        recommendedDirection: tradeIdea?.direction,
        recommendedEntry: tradeIdea?.entry,
        recommendedStopLoss: tradeIdea?.stopLoss,
        recommendedTarget: tradeIdea?.target,
        recommendedRiskRewardRatio: tradeIdea?.riskRewardRatio,
        // TradeIdea.educationNote, not a separate parameter -- 6.4/D13
        // already established this as the one field CIO's education
        // annotation rides on; journal-schema.ts's own column just snapshots
        // it, no second source invented for the same value.
        educationNote: tradeIdea?.educationNote,
        cioVerdictLabel: cioVerdict?.verdict,
        cioConfidence: cioVerdict?.confidence,
        recommendationGeneratedAt: cioVerdict ? new Date(cioVerdict.generatedAtIso) : undefined,
      })
      .returning();
    return row;
  }

  async getById(id: string): Promise<JournalEntryRow | undefined> {
    const [row] = await this.db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1);
    return row;
  }

  async listByUser(userId: string): Promise<JournalEntryRow[]> {
    return this.db.select().from(journalEntries).where(eq(journalEntries.userId, userId));
  }

  // Outcome columns are written exactly once (journal-schema.ts's own header
  // comment). The read below surfaces the right error for the common case;
  // the write itself is additionally guarded on status = 'open' so two
  // concurrent recordOutcome() calls for the same entry can't both succeed
  // (closes the TOCTOU gap a plain read-then-write would leave open).
  async recordOutcome(id: string, outcome: RecordOutcomeInput): Promise<JournalEntryRow> {
    validateOutcome(outcome);

    const current = await this.getById(id);
    if (!current) throw new NotFoundError(id);
    if (current.status === 'closed') throw new AlreadyClosedError(id);

    const realizedPnl = calculateRealizedPnl(current.side, current.quantity, current.fillPrice, outcome.exitPrice);

    const [row] = await this.db
      .update(journalEntries)
      .set({
        status: 'closed',
        exitPrice: outcome.exitPrice,
        exitAt: new Date(outcome.exitAtIso),
        realizedPnl,
      })
      .where(and(eq(journalEntries.id, id), eq(journalEntries.status, 'open')))
      .returning();

    if (!row) throw new AlreadyClosedError(id);
    return row;
  }
}
