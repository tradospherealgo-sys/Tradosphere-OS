import { describe, it, expect } from 'vitest';
import { pricePositions, computePositionsValue, computeMarkToMarket } from '../src/mtm';
import type { Position, PricedPosition } from '../src/positions';
import { InMemoryTradeRecordSource, InMemoryPriceSource } from './fakes';

describe('pricePositions', () => {
  it('returns nothing missing when every position has a price', () => {
    const positions: Position[] = [
      { symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 },
      { symbol: 'TSLA', direction: 'short', quantity: 2, averageEntryPrice: 300 },
    ];
    const priceSource = new InMemoryPriceSource();
    priceSource.setPrice('AAPL', 120, new Date().toISOString());
    priceSource.setPrice('TSLA', 250, new Date().toISOString());

    return pricePositions(positions, priceSource).then((result) => {
      expect(result.missingPriceSymbols).toEqual([]);
      expect(result.priced.map((p) => p.position.symbol)).toEqual(['AAPL', 'TSLA']);
      expect(result.priced.map((p) => p.currentPrice)).toEqual([120, 250]);
    });
  });

  it('reports a symbol with no live tick in missingPriceSymbols instead of guessing a price', () => {
    const positions: Position[] = [
      { symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 },
      { symbol: 'TSLA', direction: 'long', quantity: 2, averageEntryPrice: 300 },
    ];
    const priceSource = new InMemoryPriceSource();
    priceSource.setPrice('AAPL', 120, new Date().toISOString());
    // TSLA deliberately left unpriced.

    return pricePositions(positions, priceSource).then((result) => {
      expect(result.missingPriceSymbols).toEqual(['TSLA']);
      expect(result.priced.map((p) => p.position.symbol)).toEqual(['AAPL']);
    });
  });
});

describe('computePositionsValue', () => {
  it('returns 0 for no priced positions', () => {
    expect(computePositionsValue([])).toBe(0);
  });

  it('sums signed market value across long and short positions', () => {
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 }, currentPrice: 120 },
      { position: { symbol: 'TSLA', direction: 'short', quantity: 5, averageEntryPrice: 300 }, currentPrice: 250 },
    ];
    // AAPL: +1200, TSLA: -1250
    expect(computePositionsValue(priced)).toBe(-50);
  });
});

describe('computeMarkToMarket', () => {
  it('returns startingCash as totalEquity with no trades and no positions', async () => {
    const tradeRecordSource = new InMemoryTradeRecordSource();
    const priceSource = new InMemoryPriceSource();

    const mtm = await computeMarkToMarket('user-1', tradeRecordSource, priceSource, 5_000);

    expect(mtm).toEqual({
      cashBalance: 5_000,
      positionsValue: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalEquity: 5_000,
      positions: [],
      pricedPositions: [],
      missingPriceSymbols: [],
    });
  });

  // The central reconciliation Decision D17 and task 8.3's exit criterion
  // both require: totalEquity (startingCash + realizedPnl + unrealizedPnl)
  // must equal cashBalance + positionsValue (the balance-sheet view) --
  // proven algebraically in portfolio-schema.ts's doc comment. This test
  // exercises that identity against one open long, one open short, and two
  // closed trades (one long, one short) all for the same user, with every
  // open position fully priced -- the exact condition POST /portfolio/snapshot
  // enforces before it will ever persist a row.
  it('reconciles totalEquity === cashBalance + positionsValue when every open position is fully priced', async () => {
    const tradeRecordSource = new InMemoryTradeRecordSource();
    const priceSource = new InMemoryPriceSource();

    tradeRecordSource.addTrade({ id: 't1', symbol: 'AAPL', side: 'buy', quantity: 10, fillPrice: 100, status: 'open' });
    tradeRecordSource.addTrade({ id: 't2', symbol: 'TSLA', side: 'sell', quantity: 5, fillPrice: 300, status: 'open' });
    tradeRecordSource.addTrade({
      id: 't3',
      symbol: 'MSFT',
      side: 'buy',
      quantity: 5,
      fillPrice: 50,
      status: 'closed',
      exitPrice: 70,
      exitAtIso: new Date().toISOString(),
      realizedPnl: 100,
    });
    tradeRecordSource.addTrade({
      id: 't4',
      symbol: 'GOOG',
      side: 'sell',
      quantity: 2,
      fillPrice: 1000,
      status: 'closed',
      exitPrice: 900,
      exitAtIso: new Date().toISOString(),
      realizedPnl: 200,
    });
    priceSource.setPrice('AAPL', 120, new Date().toISOString());
    priceSource.setPrice('TSLA', 250, new Date().toISOString());

    const mtm = await computeMarkToMarket('user-1', tradeRecordSource, priceSource, 100_000);

    expect(mtm.missingPriceSymbols).toEqual([]);
    expect(mtm.cashBalance).toBe(100_800);
    expect(mtm.positionsValue).toBe(-50);
    expect(mtm.realizedPnl).toBe(300);
    expect(mtm.unrealizedPnl).toBe(450);
    expect(mtm.totalEquity).toBe(100_750);
    // The identity itself, computed both ways from the same result object --
    // this is the assertion that actually matters; the hard-coded numbers
    // above just make a failure easy to diagnose.
    expect(mtm.totalEquity).toBe(mtm.cashBalance + mtm.positionsValue);
  });

  it('excludes an unpriced open position from unrealizedPnl and positionsValue alike, and flags it in missingPriceSymbols', async () => {
    const tradeRecordSource = new InMemoryTradeRecordSource();
    const priceSource = new InMemoryPriceSource();

    tradeRecordSource.addTrade({ id: 't1', symbol: 'AAPL', side: 'buy', quantity: 10, fillPrice: 100, status: 'open' });
    tradeRecordSource.addTrade({ id: 't2', symbol: 'TSLA', side: 'buy', quantity: 2, fillPrice: 300, status: 'open' });
    // AAPL deliberately left unpriced; only TSLA gets a tick.
    priceSource.setPrice('TSLA', 350, new Date().toISOString());

    const mtm = await computeMarkToMarket('user-1', tradeRecordSource, priceSource, 10_000);

    expect(mtm.missingPriceSymbols).toEqual(['AAPL']);
    // Both positions still show up in the raw positions list (computed from
    // trades alone) -- only pricedPositions, unrealizedPnl, and
    // positionsValue exclude the unpriced symbol.
    expect(mtm.positions.map((p) => p.symbol)).toEqual(['AAPL', 'TSLA']);
    expect(mtm.pricedPositions.map((p) => p.position.symbol)).toEqual(['TSLA']);
    expect(mtm.unrealizedPnl).toBe(100); // TSLA only: (350-300)*2
    expect(mtm.positionsValue).toBe(700); // TSLA only: 350*2
    // Reconciliation deliberately does NOT hold here: cashBalance already
    // reflects the cash spent opening the unpriced AAPL position, but
    // totalEquity's unrealizedPnl term excludes it rather than assuming a
    // fabricated price. This is exactly why POST /portfolio/snapshot
    // (IncompletePricingError) refuses to persist a snapshot while
    // missingPriceSymbols is non-empty -- a persisted totalEquity that
    // can't reconcile against cashBalance + positionsValue would be a
    // silently wrong permanent record.
    expect(mtm.totalEquity).not.toBe(mtm.cashBalance + mtm.positionsValue);
  });
});
