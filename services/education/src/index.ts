import { Pool } from 'pg';
import { createLogger } from '@tradosphere/logger';
import { requireEnv, getEnvNumber } from '@tradosphere/config';
import { createDb, runMigrations } from '@tradosphere/database';
import { buildApp } from './app';
import {
  DrizzleCategoryRepository,
  DrizzleTagRepository,
  DrizzleGlossaryRepository,
  DrizzleCourseRepository,
  DrizzleLessonRepository,
  DrizzleStrategyRepository,
  DrizzleQuizRepository,
  DrizzleQuizQuestionRepository,
  DrizzleContentTagRepository,
  DrizzleRevisionRepository,
  DrizzleProgressRepository,
  DrizzleQuizAttemptRepository,
} from './repository';

async function main() {
  const logger = createLogger('education-service');
  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

  pool.on('error', (err) => {
    // Idle client errors (e.g. connection dropped by the DB) must be
    // logged loudly, never swallowed -- an uncaught 'error' on a pg Pool
    // otherwise crashes the process with no context. Same reasoning as
    // services/auth/src/index.ts.
    logger.error({ err }, 'unexpected postgres pool error');
  });

  // Idempotent -- safe to run on every boot. This is what lets
  // `docker compose up` produce a working education service against a
  // fresh Postgres with no manual migration step. Runs the full migration
  // set (including the education-schema tables from Task 6-prep), same as
  // every other service in this repo that owns tables.
  logger.info('applying database migrations');
  await runMigrations(pool);
  logger.info('database migrations applied');

  const db = createDb(pool);

  // No Redis client and no rate-limit config here -- education's
  // package.json deliberately omits @fastify/rate-limit/ioredis (see
  // app.ts's comment on buildApp), so this bootstrap has nothing to wire
  // for either. All 12 repositories take only `db`, matching
  // repository.ts's constructors.
  const app = await buildApp({
    categoryRepo: new DrizzleCategoryRepository(db),
    tagRepo: new DrizzleTagRepository(db),
    glossaryRepo: new DrizzleGlossaryRepository(db),
    courseRepo: new DrizzleCourseRepository(db),
    lessonRepo: new DrizzleLessonRepository(db),
    strategyRepo: new DrizzleStrategyRepository(db),
    quizRepo: new DrizzleQuizRepository(db),
    quizQuestionRepo: new DrizzleQuizQuestionRepository(db),
    contentTagRepo: new DrizzleContentTagRepository(db),
    revisionRepo: new DrizzleRevisionRepository(db),
    progressRepo: new DrizzleProgressRepository(db),
    quizAttemptRepo: new DrizzleQuizAttemptRepository(db),
    jwtSecret: requireEnv('JWT_SECRET'),
    logger,
  });

  const port = getEnvNumber('EDUCATION_SERVICE_PORT', 4003);
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((err) => {
  // Logger may not exist yet if requireEnv threw before createLogger ran --
  // fall back to console so a misconfigured env var is never a silent exit.
  // eslint-disable-next-line no-console
  console.error('education-service failed to start:', err);
  process.exit(1);
});
