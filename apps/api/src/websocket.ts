import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { EventBus, Unsubscribe } from '@tradosphere/event-bus';
import { MARKET_TICKS_CHANNEL, CIO_VERDICTS_CHANNEL } from '@tradosphere/event-bus';
import type { MarketTick, CioVerdict } from '@tradosphere/shared-types';

// Task 9.3/9.13, Decision D19 sub-part (5): a new, independently-written
// TickStreamServer-style layer -- mirrors
// services/market-data/src/tick-stream-server.ts's own structure (wraps a
// plain `ws` server on top of the Fastify app's existing http.Server, no
// separate port, no extra Fastify plugin) but is NOT imported from it, per
// the same one-directional service-isolation precedent D9/D12/D17/D18
// already established: the gateway depends on shared-types and event-bus
// only, never reaching into services/market-data's internals for a ~60-line
// WS wrapper.
//
// Unlike market-data's single-channel broadcast, this layer fans in TWO
// channels onto one socket, tagging every outbound message by `type` so a
// single connection carries both kinds (openapi.yaml's /stream description,
// D19 (5)):
//   - MARKET_TICKS_CHANNEL -> { type: 'market.tick', payload: MarketTick }
//   - CIO_VERDICTS_CHANNEL -> { type: 'cio.verdict', payload: CioVerdict }
//
// No auth on the upgrade handshake -- /stream is one of the six unversioned
// Infra routes openapi.yaml lists as deliberately unauthenticated (security:
// [] on every one of them, same infra-routes list as /health, /metrics,
// /openapi.yaml, /documentation), so this follows that same rule rather than
// inventing a bespoke WS-only auth check the spec never asked for.
export type GatewayStreamMessage =
  | { type: 'market.tick'; payload: MarketTick }
  | { type: 'cio.verdict'; payload: CioVerdict };

export class GatewayStreamServer {
  private readonly wss: WebSocketServer;
  private unsubscribeTicks?: Unsubscribe;
  private unsubscribeVerdicts?: Unsubscribe;

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

  // Wires the WS layer to both Redis pub/sub channels this gateway cares
  // about. MARKET_TICKS_CHANNEL is fed by services/market-data's own live
  // ingestion (unchanged, Sprint 3); CIO_VERDICTS_CHANNEL is fed by this
  // gateway's own POST /v1/cio/verdict route (task 9.14) -- CIO verdicts
  // were never published anywhere before Sprint 9.
  async attach(eventBus: EventBus): Promise<void> {
    this.unsubscribeTicks = await eventBus.subscribe<MarketTick>(MARKET_TICKS_CHANNEL, (tick) => {
      this.send({ type: 'market.tick', payload: tick });
    });
    this.unsubscribeVerdicts = await eventBus.subscribe<CioVerdict>(CIO_VERDICTS_CHANNEL, (verdict) => {
      this.send({ type: 'cio.verdict', payload: verdict });
    });
  }

  private send(message: GatewayStreamMessage): void {
    const payload = JSON.stringify(message);
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
    await this.unsubscribeTicks?.();
    await this.unsubscribeVerdicts?.();
    for (const client of this.wss.clients) client.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }
}
