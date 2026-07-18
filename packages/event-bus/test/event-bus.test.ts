import { describe, it, expect, afterEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import { RedisEventBus } from '../src/redis-event-bus';

// Sprint 2 exit criterion: "event bus delivers a test event end-to-end."
// No live Redis is available in this sandbox, so these tests run the real
// RedisEventBus implementation against ioredis-mock (an in-memory
// ioredis-API-compatible client), the same approach packages/database used
// for pg-mem: exercise the real code path, not a parallel fake. Separate
// mock instances share pub/sub state (verified directly against the
// ioredis-mock library before writing this suite), matching how a real
// pub client and sub client share one Redis server.

describe('RedisEventBus (against ioredis-mock)', () => {
  let bus: RedisEventBus | undefined;

  afterEach(async () => {
    if (bus) {
      await bus.close();
      bus = undefined;
    }
  });

  it('delivers a published event to a subscriber end-to-end', async () => {
    const pub = new RedisMock();
    const sub = new RedisMock();
    bus = new RedisEventBus(pub, sub);

    const received: unknown[] = [];
    await bus.subscribe('trade-ideas', (payload) => {
      received.push(payload);
    });

    await bus.publish('trade-ideas', { symbol: 'NIFTY', verdict: 'bullish' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(received).toEqual([{ symbol: 'NIFTY', verdict: 'bullish' }]);
  });

  it('does not deliver events published to a different channel', async () => {
    const pub = new RedisMock();
    const sub = new RedisMock();
    bus = new RedisEventBus(pub, sub);

    const received: unknown[] = [];
    await bus.subscribe('channel-a', (payload) => received.push(payload));
    await bus.publish('channel-b', { noise: true });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(received).toHaveLength(0);
  });

  it('stops delivering events after unsubscribe', async () => {
    const pub = new RedisMock();
    const sub = new RedisMock();
    bus = new RedisEventBus(pub, sub);

    const received: unknown[] = [];
    const unsubscribe = await bus.subscribe('channel-a', (payload) => received.push(payload));
    await unsubscribe();
    await bus.publish('channel-a', { after: 'unsubscribe' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(received).toHaveLength(0);
  });

  it('supports multiple independent subscribers on the same channel', async () => {
    const pub = new RedisMock();
    const subA = new RedisMock();
    const subB = new RedisMock();
    const busA = new RedisEventBus(pub, subA);
    const busB = new RedisEventBus(pub, subB);

    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    await busA.subscribe('shared-channel', (p) => receivedA.push(p));
    await busB.subscribe('shared-channel', (p) => receivedB.push(p));

    await pub.publish('shared-channel', JSON.stringify({ tick: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(receivedA).toEqual([{ tick: 1 }]);
    expect(receivedB).toEqual([{ tick: 1 }]);

    await busA.close();
    await busB.close();
  });
});
