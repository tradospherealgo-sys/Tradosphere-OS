import Fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Logger } from '@tradosphere/logger';

export interface AppDeps {
  logger: Logger;
}

// Deliberately minimal HTTP surface. This service's real interface is the
// WebSocket stream (TickStreamServer, attached by index.ts to `app.server`)
// plus the ingestion/import jobs running in-process -- `/health` exists only
// so orchestration (docker-compose, k8s probes) has something to poll.
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see services/auth/src/app.ts for why
    logger: deps.logger as any,
    genReqId: () => randomUUID(),
  });

  app.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok' });
  });

  app.setErrorHandler((err, request, reply) => {
    request.log.error({ err }, 'unhandled error in market-data service');
    return reply.code(500).send({ error: 'internal server error' });
  });

  return app;
}
