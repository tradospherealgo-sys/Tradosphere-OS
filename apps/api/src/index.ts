// Sprint 1 smoke-test entry point only.
// Proves packages/shared-types, packages/logger, and packages/config are
// buildable and importable across the monorepo. The real API gateway
// (routing, auth middleware, rate limiting, OpenAPI contract) is built in
// Sprint 9 -- see SPRINT_BOOK.md. Do not add real endpoints here yet.

import { createLogger } from '@tradosphere/logger';
import { getEnv } from '@tradosphere/config';
import type { MarketTick } from '@tradosphere/shared-types';

const logger = createLogger('api-stub');

const sampleTick: MarketTick = {
  symbol: 'NIFTY',
  price: 24650.5,
  volume: 0,
  timestampIso: new Date().toISOString(),
};

const port = getEnv('API_PORT', '4000');

logger.info(
  { port, sampleTick },
  'Tradosphere OS API stub booted -- shared-types, logger, and config packages linked successfully.',
);
