process.env.LOG_LEVEL = 'silent'; // keep test output clean; still a real pino instance

import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import RedisMock from 'ioredis-mock';
import { createLogger } from '@tradosphere/logger';
import { hashPassword } from '@tradosphere/auth';
import { buildApp } from '../src/app';
import { InMemoryUserRepository, InMemorySessionRepository } from './fakes';

// Fastify's inject() drives the real route/preHandler/error-handler chain
// in-process, with no open port and no real Postgres/Redis -- this is an
// HTTP-contract test of app.ts, distinct from auth-logic.test.ts which
// covers the business logic directly.

const JWT_SECRET = 'test-secret-not-for-prod';

describe('services/auth HTTP surface', () => {
  let app: FastifyInstance;
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    app = await buildApp({
      userRepo,
      sessionRepo,
      jwtSecret: JWT_SECRET,
      logger: createLogger('auth-service-test'),
      // This file exercises HTTP contract behavior (status codes, body
      // shapes, auth flows), not rate-limit throttling -- that gets its own
      // dedicated coverage in rate-limit.test.ts, including a note on why
      // ioredis-mock can't validate real throttling. `max` is set high
      // enough that no test here (each firing at most a handful of
      // requests) can ever spuriously trip a 429.
      redis: new RedisMock(),
      rateLimit: { max: 10_000, timeWindowMs: 60_000 },
    });
  });

  it('POST /signup creates a user and returns tokens', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/signup',
      payload: { email: 'anshh@tradosphere.os', password: 'correct-password' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe('anshh@tradosphere.os');
    expect(typeof body.accessToken).toBe('string');
  });

  it('POST /signup rejects a missing password with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/signup',
      payload: { email: 'anshh@tradosphere.os' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /signup rejects a duplicate email with 409', async () => {
    await app.inject({
      method: 'POST',
      url: '/signup',
      payload: { email: 'anshh@tradosphere.os', password: 'password-one' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/signup',
      payload: { email: 'anshh@tradosphere.os', password: 'password-two' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('POST /signup rejects an invalid email with 400 and field-level details', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/signup',
      payload: { email: 'not-an-email', password: 'correct-password' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().details).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'email' })]));
  });

  it('POST /signup rejects a too-short password with 400 and field-level details', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/signup',
      payload: { email: 'anshh@tradosphere.os', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().details).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'password' })]));
  });

  it('POST /login issues tokens for correct credentials', async () => {
    await app.inject({
      method: 'POST',
      url: '/signup',
      payload: { email: 'anshh@tradosphere.os', password: 'correct-password' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'anshh@tradosphere.os', password: 'correct-password' },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().accessToken).toBe('string');
  });

  it('POST /login rejects a bad password with 401', async () => {
    await app.inject({
      method: 'POST',
      url: '/signup',
      payload: { email: 'anshh@tradosphere.os', password: 'correct-password' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'anshh@tradosphere.os', password: 'wrong-password' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /me rejects a missing token with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /me rejects a malformed/bad-signature token with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /me returns the caller profile for a valid token', async () => {
    const signupRes = await app.inject({
      method: 'POST',
      url: '/signup',
      payload: { email: 'anshh@tradosphere.os', password: 'correct-password' },
    });
    const { accessToken } = signupRes.json();
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe('anshh@tradosphere.os');
  });

  it('GET /admin/ping returns 403 for a non-admin caller', async () => {
    const signupRes = await app.inject({
      method: 'POST',
      url: '/signup',
      payload: { email: 'trader@tradosphere.os', password: 'trader-password' },
    });
    const { accessToken } = signupRes.json();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/ping',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /admin/ping returns 200 for an admin caller', async () => {
    const passwordHash = await hashPassword('admin-password');
    userRepo.seed({ id: 'admin-1', email: 'admin@tradosphere.os', passwordHash, role: 'admin' });
    const loginRes = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'admin@tradosphere.os', password: 'admin-password' },
    });
    const { accessToken } = loginRes.json();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/ping',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  describe('POST /refresh', () => {
    it('issues a fresh token pair for a valid refresh token', async () => {
      const signupRes = await app.inject({
        method: 'POST',
        url: '/signup',
        payload: { email: 'anshh@tradosphere.os', password: 'correct-password' },
      });
      const { refreshToken } = signupRes.json();
      const res = await app.inject({
        method: 'POST',
        url: '/refresh',
        payload: { refreshToken },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(typeof body.accessToken).toBe('string');
      expect(body.refreshToken).not.toBe(refreshToken);
    });

    it('rejects a reused (rotated-out) refresh token with 401', async () => {
      const signupRes = await app.inject({
        method: 'POST',
        url: '/signup',
        payload: { email: 'anshh@tradosphere.os', password: 'correct-password' },
      });
      const { refreshToken } = signupRes.json();
      await app.inject({ method: 'POST', url: '/refresh', payload: { refreshToken } });
      const res = await app.inject({ method: 'POST', url: '/refresh', payload: { refreshToken } });
      expect(res.statusCode).toBe(401);
    });

    it('rejects a malformed/bad-signature refresh token with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/refresh',
        payload: { refreshToken: 'not-a-real-token' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects a missing refreshToken with 400', async () => {
      const res = await app.inject({ method: 'POST', url: '/refresh', payload: {} });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /logout', () => {
    it('revokes a valid session and returns 204', async () => {
      const signupRes = await app.inject({
        method: 'POST',
        url: '/signup',
        payload: { email: 'anshh@tradosphere.os', password: 'correct-password' },
      });
      const { refreshToken } = signupRes.json();
      const res = await app.inject({ method: 'POST', url: '/logout', payload: { refreshToken } });
      expect(res.statusCode).toBe(204);

      const refreshRes = await app.inject({ method: 'POST', url: '/refresh', payload: { refreshToken } });
      expect(refreshRes.statusCode).toBe(401);
    });

    it('is idempotent for an already-revoked token', async () => {
      const signupRes = await app.inject({
        method: 'POST',
        url: '/signup',
        payload: { email: 'anshh@tradosphere.os', password: 'correct-password' },
      });
      const { refreshToken } = signupRes.json();
      await app.inject({ method: 'POST', url: '/logout', payload: { refreshToken } });
      const res = await app.inject({ method: 'POST', url: '/logout', payload: { refreshToken } });
      expect(res.statusCode).toBe(204);
    });

    it('rejects a malformed/bad-signature refresh token with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/logout',
        payload: { refreshToken: 'not-a-real-token' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects a missing refreshToken with 400', async () => {
      const res = await app.inject({ method: 'POST', url: '/logout', payload: {} });
      expect(res.statusCode).toBe(400);
    });
  });
});
