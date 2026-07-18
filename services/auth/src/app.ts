import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import type Redis from 'ioredis';
import type { Logger } from '@tradosphere/logger';
import { verifyAccessToken, InvalidTokenError, requireRole, ForbiddenError, type Role } from '@tradosphere/auth';
import { signup, login, refresh, logout } from './auth-logic';
import { EmailInUseError, InvalidCredentialsError, InvalidRefreshTokenError, SessionInvalidError } from './errors';
import type { UserRepository, SessionRepository } from './repository';
import { validateBody, signupSchema, loginSchema, refreshSchema, logoutSchema } from './validation';

export interface AppDeps {
  userRepo: UserRepository;
  sessionRepo: SessionRepository;
  jwtSecret: string;
  logger: Logger;
  // Task D (Sprint 5.5): a real ioredis-compatible client backing the
  // rate limiter below. index.ts wires a real `new Redis(REDIS_URL)` for
  // production; tests inject an ioredis-mock instance the same way
  // packages/event-bus's tests inject one into RedisEventBus -- this is
  // the one and only rate-limit code path, never a parallel in-memory
  // implementation.
  redis: Redis;
  rateLimit: { max: number; timeWindowMs: number };
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: { sub: string; role: Role };
  }
}

function requireAuth(deps: AppDeps) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing bearer token' });
    }
    const token = header.slice('Bearer '.length);
    try {
      request.authUser = verifyAccessToken(token, deps.jwtSecret);
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        return reply.code(401).send({ error: err.message });
      }
      throw err;
    }
  };
}

// The only place this service builds its HTTP surface -- index.ts just
// supplies real dependencies (drizzle repos, a real pg Pool) and calls
// listen(). Tests supply in-memory repos and call app.inject() instead,
// so every route below is covered without a real Postgres or open port.
//
// async + awaited registration below is not optional. fastify.register()
// only *schedules* a plugin to boot; it does not run the plugin body
// synchronously. Route declarations (app.post(...) etc.) below, however,
// DO run synchronously and fire whatever 'onRoute' hooks have been wired
// so far. Without awaiting the rate-limit registration, every route here
// would be declared before @fastify/rate-limit's onRoute hook exists,
// silently attaching the limiter to zero routes -- no error, no crash,
// just a rate limiter that never limits anything. (Confirmed against
// fastify/fastify-rate-limit#292, a well-known instance of this exact
// mistake; also caught locally by rate-limit.test.ts's fail-closed test,
// which is what surfaced this during Sprint 5.5 Task D.) The official
// @fastify/rate-limit README's own usage example awaits registration for
// this reason.
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  // Passing our pino instance as `logger` gives every request a
  // `request.log` child logger stamped with a correlation id (`reqId`) --
  // structured JSON, request-traceable, satisfying task 2.4 without any
  // bespoke middleware.
  //
  // The `as any` here is scoped to the logger option only: Fastify's typings
  // model a hand-rolled `FastifyBaseLogger` interface that a real pino
  // instance satisfies at runtime (pino is Fastify's own default logger)
  // but doesn't structurally match byte-for-byte, so strict TS rejects the
  // assignment even though this is Fastify's documented way to inject a
  // pre-built logger.
  const app = Fastify({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
    logger: deps.logger as any,
    genReqId: () => randomUUID(),
  });

  // Task D (Sprint 5.5): every route in this service sits behind a
  // Redis-backed rate limit -- `global: true` so new routes are covered
  // automatically instead of needing an explicit opt-in per route. Backed
  // by Redis rather than the plugin's default in-memory LRU because this
  // service is meant to run as multiple replicas behind a load balancer;
  // an in-memory limiter would let every replica hand out its own
  // separate quota, multiplying the effective limit by replica count.
  //
  // `skipOnError` is deliberately left at its default (`false`, fail
  // closed): if Redis is unreachable, requests fail loudly (500) instead
  // of silently running with brute-force protection disabled. A Redis
  // outage should be visible and alerted on, not a quiet window where
  // credential stuffing against /login goes unthrottled -- this mirrors
  // docker-compose.yml's `depends_on: redis: condition: service_healthy`,
  // which already treats Redis as a hard dependency of this service.
  await app.register(rateLimit, {
    global: true,
    max: deps.rateLimit.max,
    timeWindow: deps.rateLimit.timeWindowMs,
    redis: deps.redis,
    nameSpace: 'tradosphere-auth-rl-',
  });

  app.post('/signup', async (request, reply) => {
    const validation = validateBody(signupSchema, request.body);
    if (!validation.success) {
      return reply.code(400).send(validation.failure);
    }
    try {
      const result = await signup(deps, validation.data);
      request.log.info({ userId: result.user.id }, 'user signed up');
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof EmailInUseError) {
        return reply.code(409).send({ error: err.message });
      }
      throw err;
    }
  });

  app.post('/login', async (request, reply) => {
    const validation = validateBody(loginSchema, request.body);
    if (!validation.success) {
      return reply.code(400).send(validation.failure);
    }
    try {
      const result = await login(deps, validation.data);
      request.log.info({ userId: result.user.id }, 'user logged in');
      return reply.send(result);
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        return reply.code(401).send({ error: err.message });
      }
      throw err;
    }
  });

  // Task A (Sprint 5.5): exchanges a still-valid refresh token for a new
  // access+refresh pair. auth-logic.ts's refresh() rotates the session --
  // the presented token is revoked in the same call that issues its
  // replacement, so a stolen-and-replayed old token can never mint a
  // second session.
  app.post('/refresh', async (request, reply) => {
    const validation = validateBody(refreshSchema, request.body);
    if (!validation.success) {
      return reply.code(400).send(validation.failure);
    }
    try {
      const result = await refresh(deps, validation.data);
      request.log.info({ userId: result.user.id }, 'session refreshed');
      return reply.send(result);
    } catch (err) {
      if (err instanceof InvalidRefreshTokenError || err instanceof SessionInvalidError) {
        return reply.code(401).send({ error: err.message });
      }
      throw err;
    }
  });

  // Task A (Sprint 5.5): revokes the session behind a refresh token.
  // Idempotent -- see auth-logic.ts's logout() comment for why an
  // already-revoked/expired/unrecognized-but-validly-signed token still
  // reports success (204) rather than an error.
  app.post('/logout', async (request, reply) => {
    const validation = validateBody(logoutSchema, request.body);
    if (!validation.success) {
      return reply.code(400).send(validation.failure);
    }
    try {
      await logout(deps, validation.data);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof InvalidRefreshTokenError) {
        return reply.code(401).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get('/me', { preHandler: requireAuth(deps) }, async (request, reply) => {
    const claims = request.authUser!;
    const user = await deps.userRepo.findById(claims.sub);
    if (!user) {
      return reply.code(404).send({ error: 'user not found' });
    }
    return reply.send({ id: user.id, email: user.email, role: user.role });
  });

  // RBAC skeleton demonstration route -- proves requireRole() actually
  // gates a real endpoint, not just that the util function exists.
  app.get('/admin/ping', { preHandler: requireAuth(deps) }, async (request, reply) => {
    try {
      requireRole(request.authUser!.role, 'admin');
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return reply.code(403).send({ error: err.message });
      }
      throw err;
    }
    return reply.send({ ok: true });
  });

  app.setErrorHandler((err, request, reply) => {
    // @fastify/rate-limit's preHandler throws a plain Error with a
    // `.statusCode` of 429 once a caller exceeds `deps.rateLimit.max` --
    // see node_modules/@fastify/rate-limit/index.js's defaultErrorResponse,
    // which builds exactly `{ message: 'Rate limit exceeded, retry in ...',
    // statusCode: 429 }` and throws it from the preHandler chain, before any
    // route handler's own try/catch (below) ever runs. Every other error
    // type this service raises is already caught and replied to locally --
    // EmailInUseError, InvalidCredentialsError, InvalidRefreshTokenError,
    // SessionInvalidError in each route above, InvalidTokenError inside
    // requireAuth() -- so a 429 is the one *expected* error that reaches
    // this handler by design. Collapsing it into a generic 500 here would
    // defeat Task D's rate limiter at the last step: clients would see an
    // opaque server failure instead of a standard, retryable 429, and any
    // ops dashboard keying off 5xx rate would misread ordinary throttling as
    // an application fault. (Found via this exact symptom: rate-limit.test.ts's
    // ioredis-mock suite expected 429 on the request that exceeds `max` and
    // got 500 instead, once the Task D await-registration fix let the
    // limiter's preHandler actually run.) Every other error reaching this
    // point is genuinely unexpected, so it still logs loudly and returns a
    // deliberately generic 500 with no internal detail leaked to the client.
    if (err.statusCode === 429) {
      return reply.code(429).send({ error: err.message });
    }
    request.log.error({ err }, 'unhandled error in auth service');
    return reply.code(500).send({ error: 'internal server error' });
  });

  return app;
}
