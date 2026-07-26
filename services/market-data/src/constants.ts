// Event-bus channel every normalized live tick is published to. Any future
// consumer (research engine, CIO engine, frontend gateway) subscribes here
// instead of talking to services/market-data's internals directly.
//
// Sprint 9 / Decision D19: promoted to packages/event-bus/src/channels.ts
// alongside the new CIO_VERDICTS_CHANNEL so any consumer imports channel
// names from one shared package rather than reaching into this service's
// internals. Re-exported here (not just deleted) so existing imports of
// MARKET_TICKS_CHANNEL from '@tradosphere/market-data' keep working.
export { MARKET_TICKS_CHANNEL } from '@tradosphere/event-bus';
