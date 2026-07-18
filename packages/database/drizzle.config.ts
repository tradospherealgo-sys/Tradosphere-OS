import type { Config } from 'drizzle-kit';

export default {
  schema: ['./src/schema.ts', './src/market-data-schema.ts', './src/fundamentals-schema.ts'],
  out: './migrations',
  dialect: 'postgresql',
} satisfies Config;
