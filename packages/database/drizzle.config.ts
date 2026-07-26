import type { Config } from 'drizzle-kit';

export default {
  schema: [
    './src/schema.ts',
    './src/market-data-schema.ts',
    './src/fundamentals-schema.ts',
    './src/education-schema.ts',
    './src/journal-schema.ts',
    './src/portfolio-schema.ts',
    './src/analytics-schema.ts',
  ],
  out: './migrations',
  dialect: 'postgresql',
} satisfies Config;
