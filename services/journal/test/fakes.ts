import type { JournalEntryRow } from '@tradosphere/database';
import type { CreateJournalEntryInput, RecordOutcomeInput } from '@tradosphere/shared-types';
import type { JournalRepository } from '../src/repository';
import { NotFoundError, AlreadyClosedError } from '../src/errors';
import { validateOutcome, calculateRealizedPnl } from '../src/pnl';

let counter = 0;

// In-memory test double for the JournalRepository port -- same "test against
// the port, not the adapter" approach as services/paper-trading/test/fakes.ts's
// InMemoryPriceSource and services/education/test/fakes.ts's InMemory*
// repositories. Calls the exact same pnl.ts validation/formula the real
// DrizzleJournalRepository calls, so the two adapters can never silently
// diverge on what the business rules actually are -- only storage differs.
export class InMemoryJournalRepository implements JournalRepository {
  private readonly rows = new Map<string, JournalEntryRow>();

  async create(input: CreateJournalEntryInput): Promise<JournalEntryRow> {
    const { fill, tradeIdea, cioVerdict } = input;
    const row: JournalEntryRow = {
      id: `journal-${++counter}`,
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
