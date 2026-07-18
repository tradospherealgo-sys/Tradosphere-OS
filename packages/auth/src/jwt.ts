import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

// Every service that needs to issue or verify tokens goes through this
// module -- never call `jsonwebtoken` directly elsewhere, so the token
// shape and error handling stay consistent platform-wide.

export type Role = 'admin' | 'trader' | 'viewer';

export interface AccessTokenClaims {
  sub: string; // user id
  role: Role;
}

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';

export class InvalidTokenError extends Error {
  constructor(reason: string) {
    super(`Invalid token: ${reason}`);
    this.name = 'InvalidTokenError';
  }
}

// `jti` (a random per-token id) is deliberately included in the signed
// payload even though neither verify function below reads it back out.
// HS256 signing is deterministic and `iat`/`exp` are second-granularity,
// so two tokens signed for the *same* subject within the *same*
// wall-clock second would otherwise be byte-for-byte identical strings
// (Sprint 5.5 Task A caught this via a failing rotation test: signup
// immediately followed by /refresh, both inside one second, produced two
// "different" refresh tokens that were actually the same token). That
// breaks the refresh-token store's hash-uniqueness assumption -- the
// `sessions` table has a unique index on `refresh_token_hash`
// (packages/database/src/schema.ts) precisely so rotation can look a
// session up by hash, and a real collision there would make the second
// `sessionRepo.create()` throw a raw unique-constraint DB error instead
// of cleanly issuing a new session. `jti` costs nothing and removes the
// collision entirely, independent of clock resolution or call timing.
export function signAccessToken(claims: AccessTokenClaims, secret: string): string {
  return jwt.sign({ ...claims, jti: randomUUID() }, secret, { expiresIn: ACCESS_TOKEN_TTL });
}

export function signRefreshToken(claims: Pick<AccessTokenClaims, 'sub'>, secret: string): string {
  return jwt.sign({ ...claims, jti: randomUUID() }, secret, { expiresIn: REFRESH_TOKEN_TTL });
}

export function verifyAccessToken(token: string, secret: string): AccessTokenClaims {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, secret);
  } catch (err) {
    throw new InvalidTokenError(err instanceof Error ? err.message : 'unknown verification error');
  }

  if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded.role !== 'string') {
    throw new InvalidTokenError('malformed payload -- missing sub/role');
  }

  return { sub: decoded.sub, role: decoded.role as Role };
}

export function verifyRefreshToken(token: string, secret: string): { sub: string } {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, secret);
  } catch (err) {
    throw new InvalidTokenError(err instanceof Error ? err.message : 'unknown verification error');
  }

  if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
    throw new InvalidTokenError('malformed payload -- missing sub');
  }

  return { sub: decoded.sub };
}
