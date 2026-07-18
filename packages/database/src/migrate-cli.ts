import { Pool } from 'pg';
import { runMigrations } from './migrate';

// `pnpm db:migrate` entry point -- standalone CLI usage against
// DATABASE_URL. Services call runMigrations() directly instead of shelling
// out to this file.
async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await runMigrations(pool);
    // eslint-disable-next-line no-console
    console.log('Migrations applied successfully.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Migration failed:', err);
  process.exit(1);
});
