// Domain errors for services/portfolio. Same per-condition pattern
// services/journal/src/errors.ts and services/education/src/errors.ts
// already established.

// Thrown only when writing a Daily MTM snapshot (POST /portfolio/snapshot)
// -- never for the live read endpoints (GET /portfolio/summary and friends
// return best-effort data with `missingPriceSymbols` flagged instead, since
// those are recomputed fresh on every call, not persisted). A snapshot is a
// *permanent* historical row read back by Equity Curve/Portfolio History --
// writing one with silently-excluded positions would bake a materially
// incomplete equity figure into history forever. Same "fail loudly rather
// than persist a bad value" reasoning Sprint 3 task 3.6 (fail-loud feed
// outage behavior) and Forge charter rule 2 already established for this
// codebase.
export class IncompletePricingError extends Error {
  constructor(public readonly missingPriceSymbols: string[]) {
    super(
      `cannot write a portfolio snapshot: no live price for ${missingPriceSymbols.length} open position(s): ${missingPriceSymbols.join(', ')}`,
    );
    this.name = 'IncompletePricingError';
  }
}
