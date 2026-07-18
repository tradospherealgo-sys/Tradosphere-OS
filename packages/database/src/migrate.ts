import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import type { Pool } from 'pg';
import { createDb } from './client';

// Every service boots by calling this against its own Pool before it starts
// serving traffic (see services/auth/src/index.ts) -- migrations are
// idempotent (drizzle tracks what's applied in its own migrations table),
// so re-running this against an already-migrated database is a safe no-op.
// This is what makes `docker compose up` produce a working service on a
// fresh database with no manual migration step.
export async function runMigrations(pool: Pool): Promise<void> {
  const db = createDb(pool);
  await migrate(db, { migrationsFolder: path.join(__dirname, '..', 'migrations') });
}
