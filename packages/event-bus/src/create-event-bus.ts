import Redis from 'ioredis';
import { RedisEventBus } from './redis-event-bus';
import type { EventBus } from './types';

// The one place a service should construct an EventBus for real use --
// mirrors packages/database's createDb() factory pattern (never instantiate
// the transport directly elsewhere).
export function createEventBus(redisUrl: string): EventBus {
  const pubClient = new Redis(redisUrl);
  const subClient = new Redis(redisUrl);
  return new RedisEventBus(pubClient, subClient);
}
