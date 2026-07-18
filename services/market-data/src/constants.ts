// Event-bus channel every normalized live tick is published to. Any future
// consumer (research engine, CIO engine, frontend gateway) subscribes here
// instead of talking to services/market-data's internals directly.
export const MARKET_TICKS_CHANNEL = 'market.ticks';
