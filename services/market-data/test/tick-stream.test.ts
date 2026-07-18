import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import WebSocket from 'ws';
import RedisMock from 'ioredis-mock';
import { RedisEventBus } from '@tradosphere/event-bus';
import type { MarketTick } from '@tradosphere/shared-types';
import { TickStreamServer } from '../src/tick-stream-server';
import { MARKET_TICKS_CHANNEL } from '../src/constants';

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') resolve(address.port);
    });
  });
}

// Sprint 3 task 3.4 exit criterion: "subscriber receives live stream in
// test." Uses a real ws client against a real (loopback) http.Server and a
// real RedisEventBus backed by ioredis-mock -- the same "exercise the real
// code path" approach as packages/event-bus's own test suite.
describe('TickStreamServer (Sprint 3 task 3.4)', () => {
  let httpServer: Server | undefined;
  let tickStream: TickStreamServer | undefined;
  let eventBus: RedisEventBus | undefined;
  let client: WebSocket | undefined;

  afterEach(async () => {
    client?.terminate();
    await tickStream?.close();
    await eventBus?.close();
    await new Promise<void>((resolve) => {
      if (httpServer) httpServer.close(() => resolve());
      else resolve();
    });
  });

  it('delivers a tick published on the event bus to a connected /stream subscriber', async () => {
    httpServer = createServer();
    const port = await listen(httpServer);
    tickStream = new TickStreamServer(httpServer);
    eventBus = new RedisEventBus(new RedisMock(), new RedisMock());
    await tickStream.attach(eventBus);

    client = new WebSocket(`ws://127.0.0.1:${port}/stream`);
    await new Promise<void>((resolve, reject) => {
      client!.once('open', () => resolve());
      client!.once('error', reject);
    });

    const received: MarketTick[] = [];
    client.on('message', (data) => {
      received.push(JSON.parse(data.toString()));
    });

    const tick: MarketTick = {
      symbol: 'RELIANCE',
      price: 2500,
      volume: 100,
      timestampIso: new Date().toISOString(),
    };
    await eventBus.publish(MARKET_TICKS_CHANNEL, tick);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(received).toEqual([tick]);
    expect(tickStream.clientCount).toBe(1);
  });

  it('rejects upgrade requests to a path other than /stream', async () => {
    httpServer = createServer();
    const port = await listen(httpServer);
    tickStream = new TickStreamServer(httpServer);

    client = new WebSocket(`ws://127.0.0.1:${port}/other`);
    const closedOrErrored = await new Promise<boolean>((resolve) => {
      client!.once('error', () => resolve(true));
      client!.once('close', () => resolve(true));
    });

    expect(closedOrErrored).toBe(true);
  });
});
