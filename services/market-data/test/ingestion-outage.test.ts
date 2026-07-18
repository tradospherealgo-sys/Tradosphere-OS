import { describe, it, expect } from 'vitest';
import RedisMock from 'ioredis-mock';
import { SimulatedBrokerClient, BrokerOutageError } from '@tradosphere/broker-core';
import { RedisEventBus } from '@tradosphere/event-bus';
import { startLiveIngestion } from '../src/live-ingestion';
import { MARKET_TICKS_CHANNEL } from '../src/constants';
import { InMemoryMarketDataRepository, silentServiceLogger } from './fakes';

// Sprint 3 task 3.6 exit criterion: "simulated outage produces error, not
// fake data." Exercises the real startLiveIngestion() against
// SimulatedBrokerClient's outage hook and a real RedisEventBus (backed by
// ioredis-mock, same pattern as packages/event-bus/test/event-bus.test.ts).
describe('startLiveIngestion outage behavior (Sprint 3 task 3.6)', () => {
  it('propagates a feed outage via onFatalError and never substitutes fake ticks', async () => {
    const broker = new SimulatedBrokerClient();
    await broker.authenticate();
    const repo = new InMemoryMarketDataRepository();
    const eventBus = new RedisEventBus(new RedisMock(), new RedisMock());
    const errors: Error[] = [];
    const published: unknown[] = [];
    await eventBus.subscribe(MARKET_TICKS_CHANNEL, (payload) => published.push(payload));

    const handle = startLiveIngestion(
      {
        broker,
        repo,
        eventBus,
        logger: silentServiceLogger(),
        onFatalError: (err) => errors.push(err),
      },
      ['RELIANCE'],
    );

    broker.simulateOutage(true);
    broker.forceTick('RELIANCE');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(BrokerOutageError);
    expect(repo.stored.size).toBe(0);
    expect(published).toHaveLength(0);

    handle.stop();
    await eventBus.close();
    await broker.disconnect();
  });

  it('processes a normal tick end-to-end when there is no outage', async () => {
    const broker = new SimulatedBrokerClient();
    await broker.authenticate();
    const repo = new InMemoryMarketDataRepository();
    const eventBus = new RedisEventBus(new RedisMock(), new RedisMock());
    const published: unknown[] = [];
    await eventBus.subscribe(MARKET_TICKS_CHANNEL, (payload) => published.push(payload));

    const handle = startLiveIngestion({ broker, repo, eventBus, logger: silentServiceLogger() }, ['TCS']);

    broker.forceTick('TCS');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(repo.stored.size).toBe(1);
    expect(published).toHaveLength(1);

    handle.stop();
    await eventBus.close();
    await broker.disconnect();
  });
});
