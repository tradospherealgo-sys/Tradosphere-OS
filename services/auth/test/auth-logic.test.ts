import { describe, it, expect, beforeEach } from 'vitest';
import { verifyAccessToken, verifyRefreshToken } from '@tradosphere/auth';
import { signup, login } from '../src/auth-logic';
import { EmailInUseError, InvalidCredentialsError } from '../src/errors';
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
