// Domain errors for services/analytics. Same per-condition pattern
// services/portfolio/src/errors.ts already established: one class per real
// failure condition, never a generic "something went wrong" throw.

// Thrown when GET /analytics/reports/:id targets a report that either does
// not exist at all, or exists but belongs to a different user. The two
// cases are deliberately indistinguishable to the caller (same message,
// same 404 in app.ts) -- returning a different status/message for "not
// yours" vs. "doesn't exist" would leak the existence of another user's
// report id. This is enforced structurally, not by convention:
// analytics-repository.ts's getById(id, userId) filters by BOTH columns in
// the query itself, so an unauthorized row is never loaded into memory in
// the first place -- there is no separate fetch-then-compare-ownership
// step that a future edit could accidentally skip.
export class ReportNotFoundError extends Error {
  constructor(public readonly reportId: string) {
    super(`analytics report not found: ${reportId}`);
    this.name = 'ReportNotFoundError';
  }
}
