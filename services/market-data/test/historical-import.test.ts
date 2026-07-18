import { describe, it, expect, beforeEach } from 'vitest';
import { SimulatedBrokerClient, BrokerOutageError } from '@tradosphere/broker-core';
import { importHistoricalTicks } from '../src/historical-import';
import { InMemoryMarketDataRepository, silentInfoLogger } from './fakes';

// Sprint 3 task 3.5 exit criterion: "re-running import doesn't duplicate
// rows." SimulatedBrokerClient.getHistoricalTicks is deterministic per
// (symbol, range) and InMemoryMarketDataRepository dedupes on the same
// (symbol, timestampIso) key the real ON CONFLICT DO NOTHING migration
// enforces (packages/database/test/db.test.ts covers the real constraint).
describe('importHistoricalTicks (Sprint 3 task 3.5)', () => {
  let broker: SimulatedBrokerClient;
  let repo: InMemoryMarketDataRepository;

  beforeEach(async () => {
    broker = new SimulatedBrokerClient();
    await broker.authenticate();
    repo = new InMemoryMarketDataRepository();
  });

  it('imports historical ticks and reports accurate row counts', async () => {
    const result = await importHistoricalTicks(
      { broker, repo, logger: silentInfoLogger() },
      'RELIANCE',
      '2026-01-01T09:00:00.000Z',
      '2026-01-01T09:10:00.000Z',
    );

    expect(result.requested).toBeGreaterThan(0);
    expect(result.inserted).toBe(result.requested);
    expect(result.skipped).toBe(0);
  });

  it('re-running the same import is idempotent -- no duplicate rows', async () => {
    const first = await importHistoricalTicks(
      { broker, repo, logger: silentInfoLogger() },
      'TCS',
      '2026-01-01T09:00:00.000Z',
      '2026-01-01T09:10:00.000Z',
    );
    const second = await importHistoricalTicks(
      { broker, repo, logger: silentInfoLogger() },
      'TCS',
      '2026-01-01T09:00:00.000Z',
      '2026-01-01T09:10:00.000Z',
    );

    expect(second.requested).toBe(first.requested);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(second.requested);
    expect(repo.stored.size).toBe(first.inserted);
  });

  it('propagates BrokerOutageError instead of substituting fabricated ticks', async () => {
    broker.simulateOutage(true);

    await expect(
      importHistoricalTicks(
        { broker, repo, logger: silentInfoLogger() },
        'INFY',
        '2026-01-01T09:00:00.000Z',
        '2026-01-01T09:10:00.000Z',
      ),
    ).rejects.toThrow(BrokerOutageError);

    expect(repo.stored.size).toBe(0);
  });
});
