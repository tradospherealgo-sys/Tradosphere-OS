import { describe, it, expect } from 'vitest';
import { directionSign, positionSign, positionMarketValue, computePositions } from '../src/positions';
import type { TradeRecord } from '../src/trade-record-source';

function trade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    id: 'trade-1',
    userId: 'user-1',
    symbol: 'AAPL',
    side: 'buy',
    quantity: 10,
    fillPrice: 100,
    filledAtIso: new Date().toISOString(),
    status: 'open',
    exitPrice: null,
    exitAtIso: null,
    realizedPnl: null,
    ...overrides,
  };
}

describe('directionSign', () => {
  it('returns 1 for buy', () => {
    expect(directionSign('buy')).toBe(1);
  });

  it('returns -1 for sell', () => {
    expect(directionSign('sell')).toBe(-1);
  });
});

describe('positionSign', () => {
  it('returns 1 for long', () => {
    expect(positionSign('long')).toBe(1);
  });

  it('returns -1 for short', () => {
    expect(positionSign('short')).toBe(-1);
  });
});

describe('positionMarketValue', () => {
  it('is positive for a long position priced above zero', () => {
    const value = positionMarketValue({
      position: { symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 },
      currentPrice: 150,
    });
    expect(value).toBe(1500);
  });

  it('is negative for a short position', () => {
    const value = positionMarketValue({
      position: { symbol: 'AAPL', direction: 'short', quantity: 10, averageEntryPrice: 100 },
      currentPrice: 150,
    });
    expect(value).toBe(-1500);
  });

  it('normalizes -0 to 0 for a short position with zero quantity', () => {
    // positionSign('short') * currentPrice * 0 === -0 in IEEE754 before
    // normalization -- positionMarketValue must return a plain 0, never a
    // signed zero that would otherwise leak into a sum/comparison.
    const value = positionMarketValue({
      position: { symbol: 'AAPL', direction: 'short', quantity: 0, averageEntryPrice: 100 },
      currentPrice: 150,
    });
    expect(Object.is(value, -0)).toBe(false);
    expect(value).toBe(0);
  });
});

describe('computePositions', () => {
  it('returns nothing when there are no trades', () => {
    expect(computePositions([])).toEqual([]);
  });

  it('ignores closed trades entirely -- only open trades form a position', () => {
    const trades = [
      trade({ status: 'closed', exitPrice: 120, exitAtIso: new Date().toISOString(), realizedPnl: 200 }),
    ];
    expect(computePositions(trades)).toEqual([]);
  });

  it('nets multiple open buys into one long position at quantity-weighted average entry price', () => {
    const trades = [
      trade({ id: 't1', side: 'buy', quantity: 10, fillPrice: 100 }),
      trade({ id: 't2', side: 'buy', quantity: 10, fillPrice: 120 }),
    ];
    expect(computePositions(trades)).toEqual([
      { symbol: 'AAPL', direction: 'long', quantity: 20, averageEntryPrice: 110 },
    ]);
  });

  it('nets an open buy and an open sell on the same symbol into the residual direction', () => {
    const trades = [
      trade({ id: 't1', side: 'buy', quantity: 10, fillPrice: 100 }),
      trade({ id: 't2', side: 'sell', quantity: 4, fillPrice: 100 }),
    ];
    // signedQuantity = 10 - 4 = 6 -> long 6. averageEntryPrice divides total
    // cost by total *unsigned* quantity across both open legs
    // (10*100 + 4*100) / (10 + 4) = 100, exactly computePositions' formula.
    expect(computePositions(trades)).toEqual([{ symbol: 'AAPL', direction: 'long', quantity: 6, averageEntryPrice: 100 }]);
  });

  it('excludes a symbol whose open trades net to exactly zero', () => {
    const trades = [
      trade({ id: 't1', side: 'buy', quantity: 10, fillPrice: 100 }),
      trade({ id: 't2', side: 'sell', quantity: 10, fillPrice: 100 }),
    ];
    expect(computePositions(trades)).toEqual([]);
  });

  it('produces a short position when net signed quantity is negative', () => {
    const trades = [trade({ side: 'sell', quantity: 5, fillPrice: 200 })];
    expect(computePositions(trades)).toEqual([{ symbol: 'AAPL', direction: 'short', quantity: 5, averageEntryPrice: 200 }]);
  });

  it('keeps different symbols independent and sorts the result by symbol', () => {
    const trades = [
      trade({ id: 't1', symbol: 'TSLA', side: 'buy', quantity: 2, fillPrice: 300 }),
      trade({ id: 't2', symbol: 'AAPL', side: 'buy', quantity: 10, fillPrice: 100 }),
    ];
    expect(computePositions(trades).map((p) => p.symbol)).toEqual(['AAPL', 'TSLA']);
  });

  it('trusts its input list as-is -- filtering by user is TradeRecordSource.listByUser\'s job, not computePositions\'', () => {
    const trades = [trade({ userId: 'user-2', quantity: 3, fillPrice: 50 })];
    expect(computePositions(trades)).toEqual([{ symbol: 'AAPL', direction: 'long', quantity: 3, averageEntryPrice: 50 }]);
  });
});
