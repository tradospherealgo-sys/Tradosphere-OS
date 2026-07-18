export type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

// Returned by subscribe() -- call it to detach the handler and issue the
// underlying UNSUBSCRIBE. Callers own the lifecycle explicitly rather than
// this module tracking every subscription for them.
export type Unsubscribe = () => Promise<void>;

export interface EventBus {
  publish<T>(channel: string, payload: T): Promise<void>;
  subscribe<T>(channel: string, handler: EventHandler<T>): Promise<Unsubscribe>;
  close(): Promise<void>;
}
