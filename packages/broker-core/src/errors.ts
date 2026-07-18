export class BrokerAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrokerAuthError';
  }
}

// Thrown for any feed disruption -- network drop, upstream 5xx, rate-limit
// lockout, simulated outage, etc. `services/market-data` must let this
// propagate as a loud, explicit failure. It must NEVER catch this and
// substitute stale/cached/fabricated ticks in its place -- that is the
// single most important behavior verified by Sprint 3 task 3.6.
export class BrokerOutageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrokerOutageError';
  }
}
