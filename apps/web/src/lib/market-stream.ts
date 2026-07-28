// Task 10.2: the one and only place apps/web opens a WebSocket, and the one
// and only place it derives a ws(s):// URL -- same "single point of
// contact" discipline as token-store.ts (localStorage) and sdk.ts
// (TradosphereClient/base URL). Connects to the gateway's real /stream
// endpoint (apps/api/src/websocket.ts's GatewayStreamServer), which fans two
// Redis channels onto one unauthenticated socket:
//   { type: 'market.tick', payload: MarketTick }
//   { type: 'cio.verdict', payload: CioVerdict }
// There is no "get current verdict"/"get expert status" REST route (see
// EXECUTION_BOOK.md Decision D23) -- a CIO verdict only ever exists here
// because something elsewhere called the real POST /v1/cio/verdict route.
// This client never fabricates one; it only relays what the gateway sends.
import { API_BASE_URL } from './sdk';
import type { CioVerdict, MarketTick } from '@tradosphere/sdk';

export type MarketStreamStatus = 'connecting' | 'open' | 'reconnecting' | 'disconnected';

export type GatewayStreamMessage =
  { type: 'market.tick'; payload: MarketTick } | { type: 'cio.verdict'; payload: CioVerdict };

export interface MarketStreamListeners {
  onStatusChange?: (status: MarketStreamStatus) => void;
  onTick?: (tick: MarketTick) => void;
  onVerdict?: (verdict: CioVerdict) => void;
}

export interface MarketStreamOptions {
  /** Override for testing; defaults to the global (browser) WebSocket. */
  webSocketImpl?: typeof WebSocket;
  /** Base delay for reconnect backoff, in ms. Doubles each attempt, capped at maxBackoffMs. */
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

function toWebSocketUrl(httpBaseUrl: string, path: string): string {
  const url = new URL(
    path.replace(/^\//, ''),
    httpBaseUrl.endsWith('/') ? httpBaseUrl : `${httpBaseUrl}/`,
  );
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/**
 * Manages one reconnecting WebSocket connection to /stream. Never called
 * directly by components -- see `src/hooks/use-market-stream.ts` for the
 * React-facing wrapper.
 */
export class MarketStreamConnection {
  private readonly url: string;
  private readonly webSocketImpl: typeof WebSocket;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private ws: WebSocket | null = null;
  private status: MarketStreamStatus = 'connecting';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByCaller = false;

  constructor(
    private readonly listeners: MarketStreamListeners,
    options: MarketStreamOptions = {},
  ) {
    this.url = toWebSocketUrl(API_BASE_URL, '/stream');
    this.webSocketImpl = options.webSocketImpl ?? (globalThis.WebSocket as typeof WebSocket);
    this.baseBackoffMs = options.baseBackoffMs ?? 1000;
    this.maxBackoffMs = options.maxBackoffMs ?? 30000;
  }

  connect(): void {
    this.closedByCaller = false;
    this.open();
  }

  private open(): void {
    this.setStatus(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    const socket = new this.webSocketImpl(this.url);
    this.ws = socket;

    socket.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      this.setStatus('open');
    });

    socket.addEventListener('message', (event) => {
      this.handleMessage(event.data);
    });

    socket.addEventListener('close', () => {
      if (this.closedByCaller) return;
      this.setStatus('disconnected');
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // 'close' always follows 'error' on both the browser and 'ws'
      // implementations -- reconnect scheduling happens there, not here, to
      // avoid double-scheduling.
    });
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let message: GatewayStreamMessage;
    try {
      message = JSON.parse(raw) as GatewayStreamMessage;
    } catch {
      return; // Malformed frame -- ignore rather than crash the stream.
    }
    if (message.type === 'market.tick') {
      this.listeners.onTick?.(message.payload);
    } else if (message.type === 'cio.verdict') {
      this.listeners.onVerdict?.(message.payload);
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(this.baseBackoffMs * 2 ** this.reconnectAttempt, this.maxBackoffMs);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      if (!this.closedByCaller) this.open();
    }, delay);
  }

  private setStatus(status: MarketStreamStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.listeners.onStatusChange?.(status);
  }

  close(): void {
    this.closedByCaller = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
