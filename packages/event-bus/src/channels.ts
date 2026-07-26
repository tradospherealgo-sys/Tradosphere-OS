// Sprint 9 / Decision D19: the canonical registry of pub/sub channel names
// shared across services. Previously MARKET_TICKS_CHANNEL was defined locally
// inside services/market-data/src/constants.ts; promoted here so any
// consumer (the Sprint 9 gateway's WebSocket layer chief among them) can
// import both existing and new channels from one place instead of reaching
// into a producing service's internals. services/market-data now re-exports
// this same constant rather than defining its own copy -- see the comment in
// its constants.ts.
export const MARKET_TICKS_CHANNEL = 'market.ticks';

// New for Sprint 9 task 9.14: the CIO engine's verdicts have no channel yet
// because nothing outside services/cio itself has needed to subscribe to
// them before now. The gateway's CIO route (task 9.14) publishes each
// generated verdict here immediately after computing it; the WebSocket
// gateway (task 9.3/9.13) subscribes and tags outgoing messages with
// type: 'cio.verdict' so frontend clients can distinguish them from tick
// messages on the same socket.
export const CIO_VERDICTS_CHANNEL = 'cio.verdicts';
