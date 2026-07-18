import { describe, it, expect, beforeEach } from 'vitest';
import { verifyAccessToken, verifyRefreshToken, signRefreshToken } from '@tradosphere/auth';
import { signup, login, refresh, logout } from '../src/auth-logic';
import {
  EmailInUseError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  SessionInvalidError,
} from '../src/errors';
import { InMemoryUserRepository, InMemorySessionRepository } from './fakes';

const JWT_SECRET = 'test-secret-not-for-prod';

describe('signup', () => {
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
  });

  it('creates a user and issues a valid access + refresh token pair', async () => {
    const result = await signup(
      { userRepo, sessionRepo, jwtSecret: JWT_SECRET },
      { email: 'anshh@tradosphere.os', password: 'correct horse battery staple' },
    );

    expect(result.user.email).toBe('anshh@tradosphere.os');
    expect(result.user.role).toBe('trader');
    expect(verifyAccessToken(result.accessToken, JWT_SECRET)).toEqual({
      sub: result.user.id,
      role: 'trader',
    });
    expect(verifyRefreshToken(result.refreshToken, JWT_SECRET).sub).toBe(result.user.id);
  });

  it('never stores the plaintext password', async () => {
    const result = await signup(
      { userRepo, sessionRepo, jwtSecret: JWT_SECRET },
      { email: 'anshh@tradosphere.os', password: 'super-secret-plaintext' },
    );
    const stored = await userRepo.findById(result.user.id);
    expect(stored?.passwordHash).not.toBe('super-secret-plaintext');
  });

  it('records a session with a hashed (not plaintext) refresh token', async () => {
    const result = await signup(
      { userRepo, sessionRepo, jwtSecret: JWT_SECRET },
      { email: 'anshh@tradosphere.os', password: 'x' },
    );
    expect(sessionRepo.created).toHaveLength(1);
    expect(sessionRepo.created[0].refreshTokenHash).not.toBe(result.refreshToken);
  });

  it('rejects a duplicate email', async () => {
    await signup(
      { userRepo, sessionRepo, jwtSecret: JWT_SECRET },
      { email: 'anshh@tradosphere.os', password: 'x' },
    );
    await expect(
      signup(
        { userRepo, sessionRepo, jwtSecret: JWT_SECRET },
        { email: 'anshh@tradosphere.os', password: 'y' },
      ),
    ).rejects.toThrow(EmailInUseError);
  });
});

describe('login', () => {
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    await signup(
      { userRepo, sessionRepo, jwtSecret: JWT_SECRET },
      { email: 'anshh@tradosphere.os', password: 'correct-password' },
    );
  });

  it('issues fresh tokens for correct credentials', async () => {
    const result = await login(
      { userRepo, sessionRepo, jwtSecret: JWT_SECRET },
      { email: 'anshh@tradosphere.os', password: 'correct-password' },
    );
    expect(result.user.email).toBe('anshh@tradosphere.os');
    expect(verifyAccessToken(result.accessToken, JWT_SECRET).sub).toBe(result.user.id);
  });

  it('rejects an unknown email with the generic credentials error', async () => {
    await expect(
      login(
        { userRepo, sessionRepo, jwtSecret: JWT_SECRET },
        { email: 'nobody@tradosphere.os', password: 'whatever' },
      ),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('rejects a wrong password with the generic credentials error', async () => {
    await expect(
      login(
        { userRepo, sessionRepo, jwtSecret: JWT_SECRET },
        { email: 'anshh@tradosphere.os', password: 'wrong-password' },
      ),
    ).rejects.toThrow(InvalidCredentialsError);
  });
});

describe('refresh', () => {
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
  });

  it('issues a new token pair and rotates the session for a valid refresh token', async () => {
    const deps = { userRepo, sessionRepo, jwtSecret: JWT_SECRET };
    const signupResult = await signup(deps, { email: 'anshh@tradosphere.os', password: 'correct-password' });

    const result = await refresh(deps, { refreshToken: signupResult.refreshToken });

    expect(result.user.id).toBe(signupResult.user.id);
    expect(result.refreshToken).not.toBe(signupResult.refreshToken);
    expect(verifyAccessToken(result.accessToken, JWT_SECRET).sub).toBe(signupResult.user.id);
    // Rotation issues a brand-new session rather than mutating the old row
    // in place -- one from signup, one from this refresh call.
    expect(sessionRepo.created).toHaveLength(2);
  });

  it('revokes the presented token in the same call that issues its replacement', async () => {
    const deps = { userRepo, sessionRepo, jwtSecret: JWT_SECRET };
    const signupResult = await signup(deps, { email: 'anshh@tradosphere.os', password: 'correct-password' });

    await refresh(deps, { refreshToken: signupResult.refreshToken });

    const originalSession = sessionRepo.created[0];
    expect(originalSession.revokedAt).not.toBeNull();
  });

  it('rejects a reused (rotated-out) refresh token', async () => {
    const deps = { userRepo, sessionRepo, jwtSecret: JWT_SECRET };
    const signupResult = await signup(deps, { email: 'anshh@tradosphere.os', password: 'correct-password' });
    await refresh(deps, { refreshToken: signupResult.refreshToken });

    await expect(refresh(deps, { refreshToken: signupResult.refreshToken })).rejects.toThrow(SessionInvalidError);
  });

  it('rejects a token with a bad signature', async () => {
    const deps = { userRepo, sessionRepo, jwtSecret: JWT_SECRET };
    await expect(refresh(deps, { refreshToken: 'not-a-real-token' })).rejects.toThrow(InvalidRefreshTokenError);
  });

  it('rejects a validly-signed token with no matching session row', async () => {
    // Signed with the right secret (passes JWT verification) but no
    // session was ever created for it -- e.g. a token signed by a
    // different service instance, or a session deleted out-of-band.
    const deps = { userRepo, sessionRepo, jwtSecret: JWT_SECRET };
    const orphanToken = signRefreshToken({ sub: 'nonexistent-user-id' }, JWT_SECRET);
    await expect(refresh(deps, { refreshToken: orphanToken })).rejects.toThrow(SessionInvalidError);
  });
});

describe('logout', () => {
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
  });

  it('revokes the session behind a valid refresh token', async () => {
    const deps = { userRepo, sessionRepo, jwtSecret: JWT_SECRET };
    const signupResult = await signup(deps, { email: 'anshh@tradosphere.os', password: 'correct-password' });

    await logout(deps, { refreshToken: signupResult.refreshToken });

    await expect(refresh(deps, { refreshToken: signupResult.refreshToken })).rejects.toThrow(SessionInvalidError);
  });

  it('is idempotent for an already-revoked token', async () => {
    const deps = { userRepo, sessionRepo, jwtSecret: JWT_SECRET };
    const signupResult = await signup(deps, { email: 'anshh@tradosphere.os', password: 'correct-password' });

    await logout(deps, { refreshToken: signupResult.refreshToken });
    await expect(logout(deps, { refreshToken: signupResult.refreshToken })).resolves.toBeUndefined();
  });

  it('is idempotent for an unrecognized but validly-signed token', async () => {
    const deps = { userRepo, sessionRepo, jwtSecret: JWT_SECRET };
    const orphanToken = signRefreshToken({ sub: 'nonexistent-user-id' }, JWT_SECRET);
    await expect(logout(deps, { refreshToken: orphanToken })).resolves.toBeUndefined();
  });

  it('rejects a token with a bad signature', async () => {
    const deps = { userRepo, sessionRepo, jwtSecret: JWT_SECRET };
    await expect(logout(deps, { refreshToken: 'not-a-real-token' })).rejects.toThrow(InvalidRefreshTokenError);
  });
});
