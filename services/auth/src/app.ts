import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Logger } from '@tradosphere/logger';
import { verifyAccessToken, InvalidTokenError, requireRole, ForbiddenError, type Role } from '@tradosphere/auth';
import { signup, login } from './auth-logic';
import { EmailInUseError, InvalidCredentialsError } from './errors';
import type { UserRepository, SessionRepository } from './repository';

export interface AppDeps {
  userRepo: UserRepository;
  sessionRepo: SessionRepository;
  jwtSecret: string;
  logger: Logger;
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
export function buildApp(deps: AppDeps): FastifyInstance {
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

  app.post('/signup', async (request, reply) => {
    const body = request.body as { email?: string; password?: string } | undefined;
    if (!body?.email || !body?.password) {
      return reply.code(400).send({ error: 'email and password are required' });
    }
    try {
      const result = await signup(deps, { email: body.email, password: body.password });
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
    const body = request.body as { email?: string; password?: string } | undefined;
    if (!body?.email || !body?.password) {
      return reply.code(400).send({ error: 'email and password are required' });
    }
    try {
      const result = await login(deps, { email: body.email, password: body.password });
      request.log.info({ userId: result.user.id }, 'user logged in');
      return reply.send(result);
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
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
    request.log.error({ err }, 'unhandled error in auth service');
    return reply.code(500).send({ error: 'internal server error' });
  });

  return app;
}
