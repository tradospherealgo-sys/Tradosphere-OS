import { describe, it, expect } from 'vitest';
import type { Fill, TradeIdea, CioVerdict } from '@tradosphere/shared-types';
import { InMemoryJournalRepository } from './fakes';
import { NotFoundError, AlreadyClosedError, InvalidOutcomeError } from '../src/errors';

// Business-rule coverage against the port (InMemoryJournalRepository), same
// "test the contract, not the adapter" split services/paper-trading/test/
// execution.test.ts and services/education/test/*.test.ts both use --
// repository.integration.test.ts is what proves DrizzleJournalRepository
// itself talks to real Postgres correctly.

const fill: Fill = {
  symbol: 'RELIANCE',
  side: 'buy',
  quantity: 10,
  price: 2500,
  filledAtIso: '2026-07-18T09:16:01.000Z',
  priceAsOfIso: '2026-07-18T09:16:00.000Z',
};

const tradeIdea: TradeIdea = {
  symbol: 'RELIANCE',
  direction: 'long',
  entry: 2500,
  stopLoss: 2450,
  target: 2600,
  riskRewardRatio: 2,
  educationNote: 'explains the group consensus',
};

const cioVerdict: CioVerdict = {
  verdict: 'bullish',
  confidence: 78,
  opinions: [],
  tradeIdeas: [],
  generatedAtIso: '2026-07-18T09:15:00.000Z',
};

describe('JournalRepository.create', () => {
  it('snapshots the full Fill + TradeIdea + CioVerdict exactly as given, status open', async () => {
    const repo = new InMemoryJournalRepository();
    const row = await repo.create({ userId: 'user-1', fill, tradeIdea, cioVerdict });

    expect(row.userId).toBe('user-1');
    expect(row.symbol).toBe('RELIANCE');
    expect(row.side).toBe('buy');
    expect(row.quantity).toBe(10);
    expect(row.fillPrice).toBe(2500);
    expect(row.filledAt.toISOString()).toBe('2026-07-18T09:16:01.000Z');
    expect(row.priceAsOf.toISOString()).toBe('2026-07-18T09:16:00.000Z');
    expect(row.recommendedDirection).toBe('long');
    expect(row.recommendedEntry).toBe(2500);
    expect(row.recommendedStopLoss).toBe(2450);
    expect(row.recommendedTarget).toBe(2600);
    expect(row.recommendedRiskRewardRatio).toBe(2);
    expect(row.cioVerdictLabel).toBe('bullish');
    expect(row.cioConfidence).toBe(78);
    expect(row.educationNote).toBe('explains the group consensus');
    expect(row.recommendationGeneratedAt?.toISOString()).toBe('2026-07-18T09:15:00.000Z');
    expect(row.status).toBe('open');
    expect(row.exitPrice).toBeNull();
    expect(row.exitAt).toBeNull();
    expect(row.realizedPnl).toBeNull();
  });

  it('leaves every recommended*/cio* field null when no CIO idea backs the trade -- never fabricated', async () => {
    const repo = new InMemoryJournalRepository();
    const row = await repo.create({ fill });

    expect(row.userId).toBeNull();
    expect(row.recommendedDirection).toBeNull();
    expect(row.recommendedEntry).toBeNull();
    expect(row.recommendedStopLoss).toBeNull();
    expect(row.recommendedTarget).toBeNull();
    expect(row.recommendedRiskRewardRatio).toBeNull();
    expect(row.cioVerdictLabel).toBeNull();
    expect(row.cioConfidence).toBeNull();
    expect(row.educationNote).toBeNull();
    expect(row.recommendationGeneratedAt).toBeNull();
    expect(row.status).toBe('open');
  });

  it('assigns each entry its own id', async () => {
    const repo = new InMemoryJournalRepository();
    const a = await repo.create({ fill });
    const b = await repo.create({ fill });
    expect(a.id).not.toBe(b.id);
  });
});

describe('JournalRepository.getById / listByUser', () => {
  it('getById returns undefined for an unknown id', async () => {
    const repo = new InMemoryJournalRepository();
    expect(await repo.getById('no-such-id')).toBeUndefined();
  });

  it('listByUser only returns entries belonging to that user', async () => {
    const repo = new InMemoryJournalRepository();
    await repo.create({ userId: 'user-1', fill });
    await repo.create({ userId: 'user-2', fill });
    await repo.create({ userId: 'user-1', fill });

    const rows = await repo.listByUser('user-1');
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.userId === 'user-1')).toBe(true);
  });
});

describe('JournalRepository.recordOutcome', () => {
  it('closes a buy entry and computes the correct realized P&L', async () => {
    const repo = new InMemoryJournalRepository();
    const created = await repo.create({ fill }); // buy, qty 10, fillPrice 2500

    const closed = await repo.recordOutcome(created.id, {
      exitPrice: 2600,
      exitAtIso: '2026-07-19T09:00:00.000Z',
    });

    expect(closed.status).toBe('closed');
    expect(closed.exitPrice).toBe(2600);
    expect(closed.exitAt?.toISOString()).toBe('2026-07-19T09:00:00.000Z');
    expect(closed.realizedPnl).toBe(1000); // (2600-2500)*10
  });

  it('closes a sell entry and computes the correct (short) realized P&L', async () => {
    const repo = new InMemoryJournalRepository();
    const created = await repo.create({ fill: { ...fill, side: 'sell', price: 2500, quantity: 4 } });

    const closed = await repo.recordOutcome(created.id, {
      exitPrice: 2400,
      exitAtIso: '2026-07-19T09:00:00.000Z',
    });

    expect(closed.realizedPnl).toBe(400); // (2500-2400)*4, short profits on a drop
  });

  it('throws NotFoundError for an unknown id', async () => {
    const repo = new InMemoryJournalRepository();
    await expect(
      repo.recordOutcome('no-such-id', { exitPrice: 100, exitAtIso: '2026-07-19T09:00:00.000Z' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws AlreadyClosedError on a second recordOutcome() call for the same entry', async () => {
    const repo = new InMemoryJournalRepository();
    const created = await repo.create({ fill });
    await repo.recordOutcome(created.id, { exitPrice: 2600, exitAtIso: '2026-07-19T09:00:00.000Z' });

    await expect(
      repo.recordOutcome(created.id, { exitPrice: 2700, exitAtIso: '2026-07-20T09:00:00.000Z' }),
    ).rejects.toThrow(AlreadyClosedError);
  });

  it('does not close or mutate the entry when the outcome itself is invalid', async () => {
    const repo = new InMemoryJournalRepository();
    const created = await repo.create({ fill });

    await expect(repo.recordOutcome(created.id, { exitPrice: -1, exitAtIso: '2026-07-19T09:00:00.000Z' })).rejects.toThrow(
      InvalidOutcomeError,
    );

    const stillOpen = await repo.getById(created.id);
    expect(stillOpen?.status).toBe('open');
    expect(stillOpen?.realizedPnl).toBeNull();
  });
});
