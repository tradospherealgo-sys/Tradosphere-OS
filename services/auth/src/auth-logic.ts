import { hashPassword, verifyPassword, signAccessToken, signRefreshToken } from '@tradosphere/auth';
import type { UserRepository, SessionRepository, UserRecord } from './repository';
import { EmailInUseError, InvalidCredentialsError } from './errors';

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
  // doesn't hand out live sessions.
  const refreshTokenHash = await hashPassword(refreshToken);
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
