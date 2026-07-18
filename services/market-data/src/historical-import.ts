import type { BrokerClient } from '@tradosphere/broker-core';
import type { Logger } from '@tradosphere/logger';
import { normalizeTick } from './normalize';
import type { InsertResult, MarketDataRepository } from './repository';

export interface HistoricalImportDeps {
  broker: BrokerClient;
  repo: MarketDataRepository;
  logger: Pick<Logger, 'info'>;
}

// Idempotent by construction: BrokerClient.getHistoricalTicks is
// deterministic for a given (symbol, range) -- see SimulatedBrokerClient's
// seeded generation -- and MarketDataRepository.insertTicks uses
// ON CONFLICT DO NOTHING keyed on (symbol, tick_timestamp). Re-running this
// import for a range you've already ingested is always a safe no-op, and
// the row counts are always logged (Sprint 3 task 3.5).
export async function importHistoricalTicks(
  deps: HistoricalImportDeps,
  symbol: string,
  fromIso: string,
  toIso: string,
): Promise<InsertResult> {
  const rawTicks = await deps.broker.getHistoricalTicks(symbol, fromIso, toIso);
  const normalized = rawTicks.map(normalizeTick);
  const result = await deps.repo.insertTicks(normalized);

  deps.logger.info(
    { symbol, fromIso, toIso, ...result },
    'historical import complete',
  );

  return result;
}
