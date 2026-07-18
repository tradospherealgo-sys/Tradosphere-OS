import { z } from 'zod';

// Sprint 5.5 (Task C): every public route validates its body against one of
// these schemas *before* auth-logic.ts ever runs (see `validateBody()`
// below, called from each route in app.ts). Validation is entirely an
// HTTP-layer concern -- auth-logic.ts stays framework-agnostic and keeps
// trusting its input shape exactly as it always has, consistent with
// app.ts being "a thin adapter" (see app.ts's top-of-file comment).

// 128 is an intentional upper bound, not a design opinion about what makes
// a "good" password -- it exists so a client can't hand bcrypt a
// multi-megabyte string as a cheap CPU-exhaustion vector (hashing cost is
// a function of input size as well as the cost factor). 8 is a
// conservative floor. This is deliberately *not* a full complexity policy
// (uppercase/digit/symbol requirements) -- that's a product decision, not
// a stabilization fix, and is out of scope for this sprint.
const email = z.string().trim().min(1, 'email is required').email('email must be a valid email address');
const password = z
  .string()
  .min(8, 'password must be at least 8 characters')
  .max(128, 'password must be at most 128 characters');
// Refresh tokens are opaque bearer strings here -- verifyRefreshToken()
// (packages/auth) does the real cryptographic validation immediately after
// this schema passes. Duplicating a JWT-shape regex here would just be two
// places that can disagree about what a valid token looks like.
const refreshToken = z.string().trim().min(1, 'refreshToken is required');

export const signupSchema = z.object({ email, password });
export const loginSchema = z.object({ email, password });
export const refreshSchema = z.object({ refreshToken });
export const logoutSchema = z.object({ refreshToken });

export type SignupBody = z.infer<typeof signupSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type RefreshBody = z.infer<typeof refreshSchema>;
export type LogoutBody = z.infer<typeof logoutSchema>;

export interface ValidationFailure {
  error: string;
  details: Array<{ path: string; message: string }>;
}

export type ValidationResult<T> = { success: true; data: T } | { success: false; failure: ValidationFailure };

// Every route's error shape stays `{ error: string }` (matching the
// pre-existing EmailInUseError/InvalidCredentialsError responses) with an
// additional `details` array for field-level feedback -- callers that only
// read `.error` see the same contract as before; callers that want to know
// *which* field failed can read `.details`.
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
