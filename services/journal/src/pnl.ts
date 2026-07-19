import type { OrderSide, RecordOutcomeInput } from '@tradosphere/shared-types';
import { InvalidOutcomeError } from './errors';

// Pure trade-outcome logic for services/journal: validating a proposed exit
// and computing the realized P&L it produces. Kept separate from
// repository.ts's storage adapters -- mirrors services/cio's scoring.ts
// split from consensus.ts/cio.ts (Decision D9: small, pure, stateless
// helpers get their own file) -- so DrizzleJournalRepository and
// test/fakes.ts's InMemoryJournalRepository both call the exact same rules.
// Neither adapter re-implements validation or the P&L formula itself; only
// how a row is stored differs between them.

export function validateOutcome(outcome: RecordOutcomeInput): void {
  if (!Number.isFinite(outcome.exitPrice) || outcome.exitPrice <= 0) {
    throw new InvalidOutcomeError(`exitPrice must be a positive finite number, got ${outcome.exitPrice}`);
  }
  if (!outcome.exitAtIso || Number.isNaN(Date.parse(outcome.exitAtIso))) {
    throw new InvalidOutcomeError(`exitAtIso must be a valid ISO timestamp, got "${outcome.exitAtIso}"`);
  }
}

// The entry's own `side` -- the real Fill's side journal-schema.ts stores
// (task 8.1) -- is what determines long/short, never `recommendedDirection`.
// `recommendedDirection` is CIO's nullable recommendation and may not even
// match what the trader actually did (Decision D16), so it is never treated
// as ground truth for a P&L calculation. A 'buy' fill opened a long position
// (profits as price rises); a 'sell' fill opened a short position (profits
// as price falls).
export function calculateRealizedPnl(
  side: OrderSide,
  quantity: number,
  fillPrice: number,
  exitPrice: number,
): number {
  const direction = side === 'buy' ? 1 : -1;
  const pnl = direction * (exitPrice - fillPrice) * quantity;
  // Normalize -0 to 0. A breakeven short (e.g. sell @ 2500, exit @ 2500)
  // computes as -1 * 0 * qty, which IEEE-754 evaluates to -0 -- mathematically
  // equal to zero (-0 === 0 is true) but a value no trader should ever see on
  // a P&L line, and one that trips exact-equality checks (Object.is, some
  // serializers) that a plain 0 would pass.
  return pnl === 0 ? 0 : pnl;
}
