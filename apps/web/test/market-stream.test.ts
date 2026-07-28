import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Task 10.2: proves MarketStreamConnection genuinely parses real WebSocket
// frames from a real bound server on /stream -- mirrors auth-flow.test.ts's
// real-bound-socket philosophy (no mocked transport). Uses the 'ws' package
// as the injectable webSocketImpl (Node has no global WebSocket that talks
// to an http.Server the way the browser one does), exactly as
// market-stream.ts's MarketStreamOptions.webSocketImpl was designed for.

type MarketStreamModule = typeof import('../src/lib/market-stream');

let httpServer: Server;
let wss: WebSocketServer;
let baseUrl: string;
let marketStream: MarketStreamModule;
// Populated by a persistent 'connection' listener rather than read from
// wss.clients at assertion time -- wss.clients can still contain a socket
// from the *previous* test for a few ms after that test's afterEach closes
// it (the close handshake is async), so indexing into it risks grabbing a
// closing/stale socket instead of the new test's real connection.
let serverSockets: import('ws').WebSocket[] = [];

beforeAll(async () => {
  httpServer = createServer();
  wss = new WebSocketServer({ server: httpServer, path: '/stream' });
  wss.on('connection', (socket) => serverSockets.push(socket));
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  // sdk.ts (and therefore market-stream.ts, which derives its URL from
  // sdk.ts's API_BASE_URL) reads NEXT_PUBLIC_API_BASE_URL once at
  // module-evaluation time, so this must be set before the first dynamic
  // import -- same convention as auth-flow.test.ts.
  process.env.NEXT_PUBLIC_API_BASE_URL = baseUrl;
  marketStream = await import('../src/lib/market-stream');
});

afterEach(() => {
  wss.clients.forEach((client) => client.close());
  serverSockets = [];
});

afterAll(async () => {
  wss.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function waitFor<T>(predicate: () => T | undefined, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const value = predicate();
      if (value !== undefined) {
        resolve(value);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('waitFor timed out'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe('MarketStreamConnection', () => {
  it('reaches "open" against a real bound /stream server', async () => {
    // MarketStreamConnection's internal status field already defaults to
    // 'connecting' before connect() is ever called, so the first
    // setStatus('connecting') inside open() is deduped and never reaches
    // onStatusChange -- the hook layer (use-market-stream.ts) covers this by
    // seeding its own React state with useState('connecting'), so the UI's
    // first paint is still correct. Here we only assert the real transition
    // an external listener actually observes: straight to 'open'.
    const statuses: string[] = [];
    const connection = new marketStream.MarketStreamConnection(
      { onStatusChange: (s) => statuses.push(s) },
      { webSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket },
    );

    connection.connect();
    await waitFor(() => (statuses.includes('open') ? true : undefined));

    expect(statuses).toEqual(['open']);
    connection.close();
  });

  it('parses a real market.tick frame and dispatches onTick', async () => {
    const ticks: unknown[] = [];
    const connection = new marketStream.MarketStreamConnection(
      { onTick: (t) => ticks.push(t) },
      { webSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket },
    );
    connection.connect();

    const serverSocket = await waitFor(() => serverSockets[0]);
    const tick = {
      symbol: 'RELIANCE',
      price: 2900.5,
      volume: 1200,
      timestampIso: new Date().toISOString(),
    };
    serverSocket.send(JSON.stringify({ type: 'market.tick', payload: tick }));

    await waitFor(() => (ticks.length > 0 ? true : undefined));
    expect(ticks[0]).toEqual(tick);
    connection.close();
  });

  it('parses a real cio.verdict frame and dispatches onVerdict', async () => {
    const verdicts: unknown[] = [];
    const connection = new marketStream.MarketStreamConnection(
      { onVerdict: (v) => verdicts.push(v) },
      { webSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket },
    );
    connection.connect();

    const serverSocket = await waitFor(() => serverSockets[0]);
    const verdict = {
      verdict: 'bullish',
      confidence: 0.72,
      opinions: [],
      tradeIdeas: [],
      generatedAtIso: new Date().toISOString(),
    };
    serverSocket.send(JSON.stringify({ type: 'cio.verdict', payload: verdict }));

    await waitFor(() => (verdicts.length > 0 ? true : undefined));
    expect(verdicts[0]).toEqual(verdict);
    connection.close();
  });

  it('reconnects with backoff after the server closes the socket', async () => {
    vi.useRealTimers();
    const statuses: string[] = [];
    const connection = new marketStream.MarketStreamConnection(
      { onStatusChange: (s) => statuses.push(s) },
      {
        webSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
        baseBackoffMs: 20,
        maxBackoffMs: 100,
      },
    );
    connection.connect();

    await waitFor(() => (statuses.includes('open') ? true : undefined));
    const serverSocket = await waitFor(() => serverSockets[0]);
    serverSocket.close();

    await waitFor(
      () => (statuses.filter((s) => s === 'open').length >= 2 ? true : undefined),
      5000,
    );

    expect(statuses).toContain('disconnected');
    expect(statuses).toContain('reconnecting');
    expect(statuses.filter((s) => s === 'open').length).toBeGreaterThanOrEqual(2);
    connection.close();
  });

  it('does not reconnect after an intentional close() call', async () => {
    const statuses: string[] = [];
    const connection = new marketStream.MarketStreamConnection(
      { onStatusChange: (s) => statuses.push(s) },
      {
        webSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
        baseBackoffMs: 20,
        maxBackoffMs: 100,
      },
    );
    connection.connect();
    await waitFor(() => (statuses.includes('open') ? true : undefined));

    connection.close();
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(statuses).toEqual(['open']);
  });
});
