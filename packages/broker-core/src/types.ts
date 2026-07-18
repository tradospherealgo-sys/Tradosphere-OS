// Raw, broker-native tick shape -- deliberately NOT the same field names as
// `MarketTick` (packages/shared-types). Every real broker (SMC Global or
// otherwise) speaks its own wire format; `services/market-data`'s job is to
// normalize whatever shape a `BrokerClient` produces into the shared schema.
// Keeping this shape distinct from `MarketTick` is what makes the
// normalization step in Sprint 3 real work, not a pass-through.
export interface RawBrokerTick {
  tradingSymbol: string;
  lastTradedPrice: number;
  tradedQty: number;
  exchangeTimestamp: string; // ISO 8601
}

export interface BrokerCredentials {
  apiKey: string;
  apiSecret: string;
}

export type Unsubscribe = () => void;
