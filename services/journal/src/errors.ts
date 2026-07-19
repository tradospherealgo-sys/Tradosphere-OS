// Domain errors for services/journal. Each error class parameterizes on the
// journal entry id so a caller (and its logs) always knows exactly which row
// failed -- same per-entity-id pattern services/education/src/errors.ts and
// services/paper-trading/src/execution.ts (NoMarketDataError) both already
// established.

export class NotFoundError extends Error {
  constructor(id: string) {
    super(`journal entry not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

// journal-schema.ts's own header comment: outcome columns are "written
// exactly once ... never silently overwrite an already-closed entry."
// recordOutcome() enforces that invariant here rather than trusting every
// future caller to check status first -- the same no-silent-fallback
// reasoning Forge's charter rule 2 applies to a fabricated fill price
// applies here to a fabricated/overwritten trade outcome.
export class AlreadyClosedError extends Error {
  constructor(id: string) {
    super(`journal entry ${id} is already closed -- an outcome may only be recorded once`);
    this.name = 'AlreadyClosedError';
  }
}

export class InvalidOutcomeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOutcomeError';
  }
}
