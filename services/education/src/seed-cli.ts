import { Pool } from 'pg';
import { createLogger } from '@tradosphere/logger';
import { requireEnv } from '@tradosphere/config';
import { createDb, runMigrations } from '@tradosphere/database';
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
} from './repository';
import { seedEducationContent } from './seed';

// `pnpm seed` entry point -- standalone CLI usage against DATABASE_URL,
// mirroring packages/database/src/migrate-cli.ts's Pool -> action -> close
// pattern. Runs migrations first so `pnpm seed` works unattended against a
// fresh database with no separate migrate step first, same as index.ts's own
// boot sequence.
async function main(): Promise<void> {
  const logger = createLogger('education-seed');
  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });
  try {
    await runMigrations(pool);
    const db = createDb(pool);
    const counts = await seedEducationContent({
      categoryRepo: new DrizzleCategoryRepository(db),
      tagRepo: new DrizzleTagRepository(db),
      glossaryRepo: new DrizzleGlossaryRepository(db),
      courseRepo: new DrizzleCourseRepository(db),
      lessonRepo: new DrizzleLessonRepository(db),
      strategyRepo: new DrizzleStrategyRepository(db),
      quizRepo: new DrizzleQuizRepository(db),
      quizQuestionRepo: new DrizzleQuizQuestionRepository(db),
      contentTagRepo: new DrizzleContentTagRepository(db),
      logger,
    });
    // eslint-disable-next-line no-console
    console.log(`Seed complete: ${counts.inserted} inserted, ${counts.skipped} skipped.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('education-service seed failed:', err);
  process.exit(1);
});
