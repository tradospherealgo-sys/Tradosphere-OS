import type { RawBrokerTick, Unsubscribe } from './types';

// The broker-agnostic port every downstream service (market-data today;
// paper-trading/order-routing later) depends on. Sprint 3 ships one
// implementation -- `SimulatedBrokerClient` -- because SMC Global's API is
// not yet public (see EXECUTION_BOOK.md decision D5). A real
// `SmcGlobalBrokerClient` gets built later against this exact interface with
// zero changes required in any consumer.
export interface BrokerClient {
  authenticate(): Promise<void>;

  getHistoricalTicks(symbol: string, fromIso: string, toIso: string): Promise<RawBrokerTick[]>;

  // `onError` fires for feed disruptions (see BrokerOutageError) -- consumers
  // must treat it as fatal to the stream, never silently retry with stale data.
  subscribeTicks(
    symbols: string[],
    onTick: (tick: RawBrokerTick) => void,
    onError?: (err: Error) => void,
  ): Unsubscribe;

  disconnect(): Promise<void>;
}
