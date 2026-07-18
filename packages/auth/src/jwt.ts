import jwt from 'jsonwebtoken';

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

export function signAccessToken(claims: AccessTokenClaims, secret: string): string {
  return jwt.sign(claims, secret, { expiresIn: ACCESS_TOKEN_TTL });
}

export function signRefreshToken(claims: Pick<AccessTokenClaims, 'sub'>, secret: string): string {
  return jwt.sign(claims, secret, { expiresIn: REFRESH_TOKEN_TTL });
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
