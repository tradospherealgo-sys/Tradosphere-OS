import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'node:http';
import { WebSocket } from 'ws';
import { MARKET_TICKS_CHANNEL, CIO_VERDICTS_CHANNEL } from '@tradosphere/event-bus';
import type { MarketTick, CioVerdict } from '@tradosphere/shared-types';
import { GatewayStreamServer, type GatewayStreamMessage } from '../src/websocket';
import { InMemoryEventBus } from './fakes';

// Task 9.3/9.13/9.15: no precedent WS test exists anywhere in the repo
// (services/market-data/test has no test for its own TickStreamServer this
// class mirrors), so this suite is authored from scratch. It spins up a
// real node:http.Server (GatewayStreamServer only knows how to attach to a
// real http.Server's 'upgrade' event, not a Fastify inject() fake), wraps it
// with GatewayStreamServer, attaches an InMemoryEventBus, and connects a
// real `ws` client to prove the fan-in-two-channels/tag-by-type contract
// end-to-end -- not just that attach() calls subscribe() correctly.

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
}

function waitForMessage(ws: WebSocket): Promise<GatewayStreamMessage> {
  return new Promise((resolve, reject) => {
    ws.once('message', (data) => {
      try {
        resolve(JSON.parse(data.toString()) as GatewayStreamMessage);
      } catch (err) {
        reject(err);
      }
    });
  });
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

describe('apps/api GatewayStreamServer', () => {
  let httpServer: http.Server;
  let streamServer: GatewayStreamServer;
  let client: WebSocket | undefined;

  afterEach(async () => {
    client?.terminate();
    await streamServer?.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function setup(): Promise<{ port: number; eventBus: InMemoryEventBus }> {
    httpServer = http.createServer();
    streamServer = new GatewayStreamServer(httpServer);
    const eventBus = new InMemoryEventBus();
    await streamServer.attach(eventBus);
    const port = await listen(httpServer);
    return { port, eventBus };
  }

  it('accepts an unauthenticated upgrade on /stream (infra route, no auth per openapi.yaml)', async () => {
    const { port } = await setup();
    client = new WebSocket(`ws://127.0.0.1:${port}/stream`);
    await waitForOpen(client);
    expect(streamServer.clientCount).toBe(1);
  });

  it('destroys the socket for an upgrade on any path other than /stream', async () => {
    const { port } = await setup();
    client = new WebSocket(`ws://127.0.0.1:${port}/not-stream`);
    await new Promise<void>((resolve) => {
      client!.once('error', () => resolve());
      client!.once('close', () => resolve());
    });
    expect(streamServer.clientCount).toBe(0);
  });

  it('broadcasts a market tick tagged as type "market.tick"', async () => {
    const { port, eventBus } = await setup();
    client = new WebSocket(`ws://127.0.0.1:${port}/stream`);
    await waitForOpen(client);

    const tick: MarketTick = { symbol: 'AAPL', price: 150, volume: 1_000, timestampIso: '2026-07-26T12:00:00.000Z' };
    const received = waitForMessage(client);
    await eventBus.publish(MARKET_TICKS_CHANNEL, tick);

    expect(await received).toEqual({ type: 'market.tick', payload: tick });
  });

  it('broadcasts a CIO verdict tagged as type "cio.verdict" (task 9.14 wiring)', async () => {
    const { port, eventBus } = await setup();
    client = new WebSocket(`ws://127.0.0.1:${port}/stream`);
    await waitForOpen(client);

    const verdict: CioVerdict = {
      verdict: 'neutral',
      confidence: 0,
      opinions: [],
      tradeIdeas: [],
      generatedAtIso: '2026-07-26T12:00:00.000Z',
    };
    const received = waitForMessage(client);
    await eventBus.publish(CIO_VERDICTS_CHANNEL, verdict);

    expect(await received).toEqual({ type: 'cio.verdict', payload: verdict });
  });

  it('fans both channels into the same connection', async () => {
    const { port, eventBus } = await setup();
    client = new WebSocket(`ws://127.0.0.1:${port}/stream`);
    await waitForOpen(client);

    const tick: MarketTick = { symbol: 'TSLA', price: 300, volume: 500, timestampIso: '2026-07-26T12:00:00.000Z' };
    const verdict: CioVerdict = {
      verdict: 'bullish',
      confidence: 80,
      opinions: [],
      tradeIdeas: [],
      generatedAtIso: '2026-07-26T12:00:01.000Z',
    };

    const messages: GatewayStreamMessage[] = [];
    client.on('message', (data) => messages.push(JSON.parse(data.toString())));

    await eventBus.publish(MARKET_TICKS_CHANNEL, tick);
    await eventBus.publish(CIO_VERDICTS_CHANNEL, verdict);
    // Give the event loop a tick to deliver both WS frames.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(messages).toEqual([
      { type: 'market.tick', payload: tick },
      { type: 'cio.verdict', payload: verdict },
    ]);
  });

  it('does not broadcast to a client after it disconnects', async () => {
    const { port, eventBus } = await setup();
    client = new WebSocket(`ws://127.0.0.1:${port}/stream`);
    await waitForOpen(client);
    client.terminate();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(streamServer.clientCount).toBe(0);

    // No listener remains to receive this -- publishing must not throw even
    // with zero connected clients.
    await expect(
      eventBus.publish(MARKET_TICKS_CHANNEL, {
        symbol: 'AAPL',
        price: 1,
        volume: 1,
        timestampIso: '2026-07-26T12:00:00.000Z',
      }),
    ).resolves.toBeUndefined();
  });

  it('close() unsubscribes from both channels and terminates connected clients', async () => {
    const { port, eventBus } = await setup();
    client = new WebSocket(`ws://127.0.0.1:${port}/stream`);
    await waitForOpen(client);

    const closed = new Promise<void>((resolve) => client!.once('close', () => resolve()));
    await streamServer.close();
    await closed;
    expect(streamServer.clientCount).toBe(0);

    // A publish after close() must not throw even though this gateway
    // instance is no longer subscribed.
    await expect(
      eventBus.publish(MARKET_TICKS_CHANNEL, {
        symbol: 'AAPL',
        price: 1,
        volume: 1,
        timestampIso: '2026-07-26T12:00:00.000Z',
      }),
    ).resolves.toBeUndefined();
  });
});
