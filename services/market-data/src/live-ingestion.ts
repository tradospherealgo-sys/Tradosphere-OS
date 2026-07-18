import type { BrokerClient, RawBrokerTick } from '@tradosphere/broker-core';
import type { EventBus } from '@tradosphere/event-bus';
import type { Logger } from '@tradosphere/logger';
import { MARKET_TICKS_CHANNEL } from './constants';
import { normalizeTick } from './normalize';
import type { MarketDataRepository } from './repository';

export interface LiveIngestionDeps {
  broker: BrokerClient;
  repo: MarketDataRepository;
  eventBus: EventBus;
  logger: Pick<Logger, 'info' | 'error'>;
  // Called when the feed reports an outage. Sprint 3 task 3.6: this must be
  // the ONLY thing that happens on outage -- no fallback to cached/fabricated
  // ticks is ever published or stored.
  onFatalError?: (err: Error) => void;
}

export interface LiveIngestionHandle {
  stop: () => void;
}

export function startLiveIngestion(deps: LiveIngestionDeps, symbols: string[]): LiveIngestionHandle {
  const stop = deps.broker.subscribeTicks(
    symbols,
    (rawTick) => {
      handleTick(deps, rawTick).catch((err) => {
        deps.logger.error({ err }, 'failed to process live tick');
      });
    },
    (err) => {
      deps.logger.error({ err }, 'market data feed outage -- no data will be substituted');
      deps.onFatalError?.(err);
    },
  );

  return { stop };
}

async function handleTick(deps: LiveIngestionDeps, rawTick: RawBrokerTick): Promise<void> {
  const tick = normalizeTick(rawTick);
  await deps.repo.insertTicks([tick]);
  await deps.eventBus.publish(MARKET_TICKS_CHANNEL, tick);
}
