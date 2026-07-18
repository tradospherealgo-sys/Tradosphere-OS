import { describe, expect, it } from 'vitest';
import { BrokerAuthError, BrokerOutageError } from '../src/errors';
import { SimulatedBrokerClient } from '../src/simulated-broker-client';

describe('SimulatedBrokerClient', () => {
  it('rejects use before authenticate()', async () => {
    const client = new SimulatedBrokerClient();
    await expect(client.getHistoricalTicks('TCS', '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z')).rejects.toThrow(
      BrokerAuthError,
    );
    expect(() => client.subscribeTicks(['TCS'], () => {})).toThrow(BrokerAuthError);
  });

  it('returns deterministic historical ticks for the same range requested twice', async () => {
    const client = new SimulatedBrokerClient();
    await client.authenticate();
    const first = await client.getHistoricalTicks('TCS', '2026-01-01T00:00:00Z', '2026-01-01T00:10:00Z');
    const second = await client.getHistoricalTicks('TCS', '2026-01-01T00:00:00Z', '2026-01-01T00:10:00Z');
    expect(first).toEqual(second);
    expect(first.length).toBe(10); // one-minute bars over a 10-minute range
  });

  it('produces different (but each internally consistent) series for different symbols', async () => {
    const client = new SimulatedBrokerClient();
    await client.authenticate();
    const tcs = await client.getHistoricalTicks('TCS', '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z');
    const infy = await client.getHistoricalTicks('INFY', '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z');
    expect(tcs).not.toEqual(infy);
    expect(tcs.every((t) => t.tradingSymbol === 'TCS')).toBe(true);
  });

  it('delivers a live tick to a subscriber via forceTick', async () => {
    const client = new SimulatedBrokerClient();
    await client.authenticate();
    const received: unknown[] = [];
    client.subscribeTicks(['TCS'], (tick) => received.push(tick));
    client.forceTick('TCS');
    expect(received).toHaveLength(1);
    expect((received[0] as { tradingSymbol: string }).tradingSymbol).toBe('TCS');
  });

  it('stops delivering ticks after unsubscribe', async () => {
    const client = new SimulatedBrokerClient();
    await client.authenticate();
    const received: unknown[] = [];
    const unsubscribe = client.subscribeTicks(['TCS'], (tick) => received.push(tick));
    client.forceTick('TCS');
    unsubscribe();
    client.forceTick('TCS');
    expect(received).toHaveLength(1);
  });

  it('fails loud with BrokerOutageError on historical fetch during a simulated outage', async () => {
    const client = new SimulatedBrokerClient();
    await client.authenticate();
    client.simulateOutage(true);
    await expect(client.getHistoricalTicks('TCS', '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z')).rejects.toThrow(
      BrokerOutageError,
    );
  });

  it('fails loud with BrokerOutageError on the live stream during a simulated outage -- never substitutes fake data', async () => {
    const client = new SimulatedBrokerClient();
    await client.authenticate();
    const ticks: unknown[] = [];
    const errors: Error[] = [];
    client.subscribeTicks(
      ['TCS'],
      (tick) => ticks.push(tick),
      (err) => errors.push(err),
    );
    client.simulateOutage(true);
    client.forceTick('TCS');
    expect(ticks).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(BrokerOutageError);
  });
});
