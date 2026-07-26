import { z } from 'zod';

// Reused verbatim from services/education/src/validation.ts -- the generic
// zod-failure shape every service's app.ts route handlers already expect.
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

// Same Date.parse-based ISO-timestamp check services/journal/src/pnl.ts's
// validateOutcome already uses for exitAtIso -- one validation convention
// for "is this string a real timestamp" across the codebase.
const isoTimestamp = z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
  message: 'must be a valid ISO 8601 timestamp',
});

// POST /portfolio/snapshot body. Deliberately does NOT accept cashBalance,
// positionsValue, realizedPnl, unrealizedPnl, or totalEquity from the
// caller -- every one of those is server-computed by mtm.ts from real
// journal_entries/market_ticks data, never client-supplied, so a snapshot
// can never be fabricated or tampered with (Forge charter rule 2). asOf
// defaults to "now" (applied in app.ts, not here) when omitted.
export const createSnapshotBodySchema = z.object({
  label: z.string().min(1).max(200).optional(),
  asOf: isoTimestamp.optional(),
});
export type CreateSnapshotBody = z.infer<typeof createSnapshotBodySchema>;

// GET /portfolio/history query params -- both optional; an absent bound
// means "no floor"/"no ceiling", never a fabricated default date range.
export const historyQuerySchema = z.object({
  from: isoTimestamp.optional(),
  to: isoTimestamp.optional(),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
