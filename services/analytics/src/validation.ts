import { z } from 'zod';

// Identical generic shape to services/portfolio/src/validation.ts and
// services/education/src/validation.ts -- the one ValidationFailure/
// ValidationResult/validateBody contract every service's app.ts already
// expects, reused verbatim (Forge charter rule 5: reuse before rewrite).
export interface ValidationFailure {
  error: string;
  details: Array<{ path: string; message: string }>;
}

export type ValidationResult<T> = { success: true; data: T } | { success: false; failure: ValidationFailure };

export function validateBody<T>(schema: z.ZodType<T>, body: unknown): ValidationResult<T> {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    failure: {
      error: 'Validation failed',
      details: result.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join('.') : '(body)',
        message: issue.message,
      })),
    },
  };
}

// Same Date.parse-based ISO-timestamp check services/portfolio/src/
// validation.ts and services/journal/src/pnl.ts already use.
const isoTimestamp = z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
  message: 'must be a valid ISO 8601 timestamp',
});

// Same uuid-with-message pattern services/education/src/validation.ts's
// uuidField already establishes, applied here to the one path param this
// service has (GET /analytics/reports/:id).
export const reportIdParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});
export type ReportIdParams = z.infer<typeof reportIdParamsSchema>;

// Shared by every GET route that reports over a period of trading history
// (performance, win-rate, average-return, risk-reward, drawdown,
// risk-adjusted-returns, expectancy, monthly-reports, strategy-stats,
// trade-distribution, heatmap, session-analysis, instrument-analysis).
// Both bounds optional -- an absent bound means "no floor"/"no ceiling"
// over the user's full history, never a fabricated default range (same
// reasoning services/portfolio's historyQuerySchema uses for
// GET /portfolio/history).
export const rangeQuerySchema = z.object({
  from: isoTimestamp.optional(),
  to: isoTimestamp.optional(),
});
export type RangeQuery = z.infer<typeof rangeQuerySchema>;

// GET /analytics/trade-distribution?buckets=N -- overrides
// trade-distribution.ts's DEFAULT_BUCKET_COUNT. This is the first numeric
// query param anywhere in this codebase (every other service's query
// params are strings or ISO timestamps), so there is no existing
// string-to-number precedent to reuse; z.coerce.number() is the standard
// zod mechanism for a query string that must parse as a number, applied
// here rather than a hand-rolled Number() + isNaN check. Omitted entirely
// falls through to trade-distribution.ts's own default rather than this
// schema inventing one.
export const tradeDistributionQuerySchema = rangeQuerySchema.extend({
  buckets: z.coerce.number().int().positive().max(100).optional(),
});
export type TradeDistributionQuery = z.infer<typeof tradeDistributionQuerySchema>;

// POST /analytics/reports body. Deliberately accepts only label/from/to/
// asOf from the caller -- never any stat column (totalTrades, winRate,
// sharpeRatio, etc.). Every stat is server-computed by app.ts's
// computeFullStatSet(), the same helper GET /analytics/performance uses, so
// a persisted report can never be fabricated or tampered with by a caller
// (Forge charter rule 2, same contract services/portfolio's
// createSnapshotBodySchema already establishes for POST /portfolio/
// snapshot).
export const createReportBodySchema = z.object({
  label: z.string().min(1).max(200).optional(),
  from: isoTimestamp.optional(),
  to: isoTimestamp.optional(),
  asOf: isoTimestamp.optional(),
});
export type CreateReportBody = z.infer<typeof createReportBodySchema>;

// GET /analytics/reports list query -- same optional from/to shape as
// rangeQuerySchema, but here it bounds which *reports* to list by their own
// asOf (analytics-repository.ts's ListReportsOptions), not which trades
// feed a live computation.
export const listReportsQuerySchema = rangeQuerySchema;
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
