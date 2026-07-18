import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { EventBus, Unsubscribe } from '@tradosphere/event-bus';
import type { MarketTick } from '@tradosphere/shared-types';
import { MARKET_TICKS_CHANNEL } from './constants';

// WebSocket layer for Sprint 3 task 3.4: internal consumers subscribe to
// live, normalized ticks over `/stream` instead of talking to the event bus
// (or the broker) directly. Wraps a plain `ws` server on top of whatever
// http.Server the service's Fastify app already exposes -- no separate port,
// no extra plugin dependency.
export class TickStreamServer {
  private readonly wss: WebSocketServer;
  private unsubscribe?: Unsubscribe;

  constructor(
    private readonly httpServer: HttpServer,
    private readonly path: string = '/stream',
  ) {
    this.wss = new WebSocketServer({ noServer: true });
    this.httpServer.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://internal');
      if (url.pathname !== this.path) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req);
      });
    });
  }

  // Wires the WS layer to the shared event bus so any normalized tick
  // published by live ingestion (or a historical backfill, if it ever
  // chooses to) reaches every connected subscriber.
  async attach(eventBus: EventBus): Promise<void> {
    this.unsubscribe = await eventBus.subscribe<MarketTick>(MARKET_TICKS_CHANNEL, (tick) => {
      this.broadcast(tick);
    });
  }

  broadcast(tick: MarketTick): void {
    const payload = JSON.stringify(tick);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  get clientCount(): number {
    return this.wss.clients.size;
  }

  async close(): Promise<void> {
    await this.unsubscribe?.();
    for (const client of this.wss.clients) client.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }
}
