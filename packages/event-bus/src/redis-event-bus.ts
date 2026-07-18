import type Redis from 'ioredis';
import type { EventBus, EventHandler, Unsubscribe } from './types';

// Redis pub/sub requires the *subscribing* connection to be dedicated: once
// a connection issues SUBSCRIBE it can't run other commands on the same
// connection. So this always takes two clients -- one for publish, one for
// subscribe -- both pointed at the same Redis instance. createEventBus()
// wires that up for real usage; tests inject two ioredis-mock instances
// (which share pub/sub state) to exercise this exact code, not a parallel
// fake implementation.
export class RedisEventBus implements EventBus {
  constructor(
    private readonly pubClient: Redis,
    private readonly subClient: Redis,
  ) {}

  async publish<T>(channel: string, payload: T): Promise<void> {
    await this.pubClient.publish(channel, JSON.stringify(payload));
  }

  async subscribe<T>(channel: string, handler: EventHandler<T>): Promise<Unsubscribe> {
    const listener = (receivedChannel: string, message: string) => {
      if (receivedChannel !== channel) return;
      let payload: T;
      try {
        payload = JSON.parse(message) as T;
      } catch {
        // Malformed message on the wire -- drop it rather than crash the
        // subscriber. A bad publisher should not be able to take down every
        // consumer of a channel.
        return;
      }
      void handler(payload);
    };

    this.subClient.on('message', listener);
    await this.subClient.subscribe(channel);

    return async () => {
      this.subClient.off('message', listener);
      await this.subClient.unsubscribe(channel);
    };
  }

  async close(): Promise<void> {
    await Promise.all([this.pubClient.quit(), this.subClient.quit()]);
  }
}
