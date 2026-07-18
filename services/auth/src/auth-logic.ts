import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
  InvalidTokenError,
} from '@tradosphere/auth';
import type { UserRepository, SessionRepository, UserRecord } from './repository';
import { EmailInUseError, InvalidCredentialsError, InvalidRefreshTokenError, SessionInvalidError } from './errors';

// Framework-agnostic business logic -- no Fastify types in this file. Keeps
// signup/login testable as plain functions against an injected repository,
// and keeps the HTTP layer (app.ts) a thin adapter around this.

export interface AuthDeps {
  userRepo: UserRepository;
  sessionRepo: SessionRepository;
  jwtSecret: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: UserRecord['role'] };
}

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function issueTokens(deps: AuthDeps, user: UserRecord): Promise<AuthResult> {
  const accessToken = signAccessToken({ sub: user.id, role: user.role }, deps.jwtSecret);
  const refreshToken = signRefreshToken({ sub: user.id }, deps.jwtSecret);

  // Refresh tokens are bearer credentials with a 30-day lifetime -- store
  // only a hash, the same way passwords are stored, so a DB leak alone
  // doesn't hand out live sessions. This is `hashRefreshToken` (SHA-256,
  // deterministic), not `hashPassword` (bcrypt, salted) -- see
  // packages/auth/src/refresh-token.ts for why bcrypt was the wrong choice
  // here (finding F-4). `find`-ability by hash is the whole point: the
  // /refresh endpoint below has to look a session up from a raw token.
  const refreshTokenHash = hashRefreshToken(refreshToken);
  await deps.sessionRepo.create({
    userId: user.id,
    refreshTokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role },
  };
}

export async function signup(
  deps: AuthDeps,
  input: { email: string; password: string },
): Promise<AuthResult> {
  const existing = await deps.userRepo.findByEmail(input.email);
  if (existing) {
    throw new EmailInUseError(input.email);
  }
  const passwordHash = await hashPassword(input.password);
  const user = await deps.userRepo.create({ email: input.email, passwordHash });
  return issueTokens(deps, user);
}

export async function login(
  deps: AuthDeps,
  input: { email: string; password: string },
): Promise<AuthResult> {
  const user = await deps.userRepo.findByEmail(input.email);
  if (!user) {
    throw new InvalidCredentialsError();
  }
  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new InvalidCredentialsError();
  }
  return issueTokens(deps, user);
}

// Task A (Sprint 5.5): exchanges a still-valid refresh token for a brand
// new access+refresh pair, and rotates the session -- the presented
// refresh token is revoked in the same call that issues its replacement,
// so it is single-use. A stolen-and-replayed old token can never mint a
// second session, even if the thief races the legitimate client for it.
export async function refresh(deps: AuthDeps, input: { refreshToken: string }): Promise<AuthResult> {
  let claims: { sub: string };
  try {
    claims = verifyRefreshToken(input.refreshToken, deps.jwtSecret);
  } catch (err) {
    if (err instanceof InvalidTokenError) {
      throw new InvalidRefreshTokenError();
    }
    throw err;
  }

  const session = await deps.sessionRepo.findByRefreshTokenHash(hashRefreshToken(input.refreshToken));

  // Collapsed check -- missing, revoked, expired, or (defense in depth)
  // pointing at a different user than the JWT claims all mean the same
  // thing to the caller: this token no longer grants a session. See
  // SessionInvalidError's comment for why the cause isn't distinguished.
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || session.userId !== claims.sub) {
    throw new SessionInvalidError();
  }

  const user = await deps.userRepo.findById(session.userId);
  if (!user) {
    throw new SessionInvalidError();
  }

  await deps.sessionRepo.revoke(session.id);
  return issueTokens(deps, user);
}

// Task A (Sprint 5.5): revokes the session behind a refresh token.
// Idempotent by design -- logging out an already-revoked, expired, or
// unrecognized (but validly *signed*) token still reports success, because
// the end state the caller cares about ("this token can't be used again")
// is already true either way. Only a bad signature is rejected outright,
// since that's not a token this service ever issued.
export async function logout(deps: AuthDeps, input: { refreshToken: string }): Promise<void> {
  try {
    verifyRefreshToken(input.refreshToken, deps.jwtSecret);
  } catch (err) {
    if (err instanceof InvalidTokenError) {
      throw new InvalidRefreshTokenError();
    }
    throw err;
  }

  const session = await deps.sessionRepo.findByRefreshTokenHash(hashRefreshToken(input.refreshToken));
  if (session && !session.revokedAt) {
    await deps.sessionRepo.revoke(session.id);
  }
}
