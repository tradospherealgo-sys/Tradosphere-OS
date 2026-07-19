import { describe, it, expect } from 'vitest';
import { computeFill, placeOrder, InvalidOrderError, NoMarketDataError } from '../src/execution';
import { InMemoryPriceSource } from './fakes';

// Task 8.1 verification: "fills use real market price, never fabricated."
// This suite proves that at the unit level (an injectable PriceSource means
// "real" here is whatever the port returns -- the real-Postgres integration
// suite in price-source.integration.test.ts is what proves the production
// adapter itself reads genuine market_ticks rows, not this file).

describe('computeFill (pure)', () => {
  it('stamps the fill with exactly the given price and timestamps -- never a different number', () => {
    const fill = computeFill(
      { symbol: 'RELIANCE', side: 'buy', quantity: 10 },
      { price: 2512.5, asOfIso: '2026-07-18T09:16:00.000Z' },
      '2026-07-18T09:16:01.000Z',
    );

    expect(fill).toEqual({
      symbol: 'RELIANCE',
      side: 'buy',
      quantity: 10,
      price: 2512.5,
      filledAtIso: '2026-07-18T09:16:01.000Z',
      priceAsOfIso: '2026-07-18T09:16:00.000Z',
    });
  });

  it('rejects an invalid order even when a valid price is supplied', () => {
    expect(() =>
      computeFill({ symbol: '', side: 'buy', quantity: 10 }, { price: 100, asOfIso: 'x' }, 'y'),
    ).toThrow(InvalidOrderError);
  });
});

describe('placeOrder (orchestration)', () => {
  it('fills a buy order at exactly the price the source returns', async () => {
    const priceSource = new InMemoryPriceSource();
    priceSource.setPrice('TCS', 4123.45, '2026-07-18T10:00:00.000Z');

    const fill = await placeOrder(
      { symbol: 'TCS', side: 'buy', quantity: 5 },
      { priceSource, now: () => new Date('2026-07-18T10:00:02.000Z') },
    );

    expect(fill.price).toBe(4123.45);
    expect(fill.priceAsOfIso).toBe('2026-07-18T10:00:00.000Z');
    expect(fill.filledAtIso).toBe('2026-07-18T10:00:02.000Z');
  });

  it('fills a sell order the same way as a buy order -- price resolution does not depend on side', async () => {
    const priceSource = new InMemoryPriceSource();
    priceSource.setPrice('INFY', 1800, '2026-07-18T11:00:00.000Z');

    const fill = await placeOrder(
      { symbol: 'INFY', side: 'sell', quantity: 3 },
      { priceSource, now: () => new Date('2026-07-18T11:00:01.000Z') },
    );

    expect(fill.side).toBe('sell');
    expect(fill.price).toBe(1800);
  });

  it('rejects with NoMarketDataError when the symbol has no real price -- never fabricates one', async () => {
    const priceSource = new InMemoryPriceSource();

    await expect(
      placeOrder({ symbol: 'UNKNOWN', side: 'buy', quantity: 1 }, { priceSource }),
    ).rejects.toThrow(NoMarketDataError);
  });

  it('never touches the price source when the order itself is invalid (quantity <= 0)', async () => {
    const priceSource = new InMemoryPriceSource();
    priceSource.setPrice('TCS', 4000, '2026-07-18T10:00:00.000Z');

    await expect(
      placeOrder({ symbol: 'TCS', side: 'buy', quantity: 0 }, { priceSource }),
    ).rejects.toThrow(InvalidOrderError);
  });

  it('rejects non-finite quantity (NaN/Infinity)', async () => {
    const priceSource = new InMemoryPriceSource();
    priceSource.setPrice('TCS', 4000, '2026-07-18T10:00:00.000Z');

    await expect(
      placeOrder({ symbol: 'TCS', side: 'buy', quantity: NaN }, { priceSource }),
    ).rejects.toThrow(InvalidOrderError);
    await expect(
      placeOrder({ symbol: 'TCS', side: 'buy', quantity: Infinity }, { priceSource }),
    ).rejects.toThrow(InvalidOrderError);
  });

  it('rejects an empty symbol', async () => {
    const priceSource = new InMemoryPriceSource();
    await expect(
      placeOrder({ symbol: '', side: 'buy', quantity: 1 }, { priceSource }),
    ).rejects.toThrow(InvalidOrderError);
  });

  it('rejects an invalid side', async () => {
    const priceSource = new InMemoryPriceSource();
    priceSource.setPrice('TCS', 4000, '2026-07-18T10:00:00.000Z');

    await expect(
      // @ts-expect-error -- deliberately invalid at the type level too, to prove the runtime guard also holds
      placeOrder({ symbol: 'TCS', side: 'hold', quantity: 1 }, { priceSource }),
    ).rejects.toThrow(InvalidOrderError);
  });

  it('is deterministic: identical order + price + clock produces an identical fill', async () => {
    const priceSource = new InMemoryPriceSource();
    priceSource.setPrice('RELIANCE', 2500, '2026-07-18T09:00:00.000Z');
    const now = () => new Date('2026-07-18T09:00:05.000Z');

    const a = await placeOrder({ symbol: 'RELIANCE', side: 'buy', quantity: 10 }, { priceSource, now });
    const b = await placeOrder({ symbol: 'RELIANCE', side: 'buy', quantity: 10 }, { priceSource, now });

    expect(a).toEqual(b);
  });

  it('defaults to the real clock when now() is not supplied', async () => {
    const priceSource = new InMemoryPriceSource();
    priceSource.setPrice('RELIANCE', 2500, '2026-07-18T09:00:00.000Z');

    const before = Date.now();
    const fill = await placeOrder({ symbol: 'RELIANCE', side: 'buy', quantity: 1 }, { priceSource });
    const after = Date.now();

    const stamped = Date.parse(fill.filledAtIso);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });
});
