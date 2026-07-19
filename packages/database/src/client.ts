import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as coreSchema from './schema';
import * as marketDataSchema from './market-data-schema';
import * as fundamentalsSchema from './fundamentals-schema';
import * as educationSchema from './education-schema';
import * as journalSchema from './journal-schema';

const schema = { ...coreSchema, ...marketDataSchema, ...fundamentalsSchema, ...educationSchema, ...journalSchema };

// Every service gets its DB handle through this factory -- never instantiate
// drizzle directly elsewhere. Accepts any pg-compatible Pool, which is what
// lets tests swap in pg-mem without touching a real Postgres instance.
export function createDb(pool: Pool) {
  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof createDb>;
