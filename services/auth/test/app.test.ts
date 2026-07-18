process.env.LOG_LEVEL = 'silent'; // keep test output clean; still a real pino instance

import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
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

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    app = buildApp({
      userRepo,
      sessionRepo,
      jwtSecret: JWT_SECRET,
      logger: createLogger('auth-service-test'),
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
      payload: { email: 'anshh@tradosphere.os', password: 'a' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/signup',
      payload: { email: 'anshh@tradosphere.os', password: 'b' },
    });
    expect(res.statusCode).toBe(409);
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
      payload: { email: 'trader@tradosphere.os', password: 'x' },
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
});
