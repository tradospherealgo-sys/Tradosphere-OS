import { describe, it, expect } from 'vitest';
import { computeRealizedPnl, computeUnrealizedPnl } from '../src/pnl';
import type { TradeRecord } from '../src/trade-record-source';
import type { PricedPosition } from '../src/positions';

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

describe('computeRealizedPnl', () => {
  it('returns 0 when there are no trades', () => {
    expect(computeRealizedPnl([])).toBe(0);
  });

  it('ignores open trades entirely -- they have no realizedPnl to sum', () => {
    expect(computeRealizedPnl([trade({ status: 'open' })])).toBe(0);
  });

  it('sums the stored realizedPnl across closed trades, never recomputing it', () => {
    // journal's calculateRealizedPnl already produced this figure when the
    // trade was closed -- computeRealizedPnl only ever sums the stored
    // value, so P&L can never silently drift from what services/journal
    // recorded.
    const trades = [
      trade({ id: 't1', status: 'closed', exitPrice: 120, exitAtIso: new Date().toISOString(), realizedPnl: 200 }),
      trade({
        id: 't2',
        symbol: 'TSLA',
        status: 'closed',
        exitPrice: 280,
        exitAtIso: new Date().toISOString(),
        realizedPnl: -40,
      }),
    ];
    expect(computeRealizedPnl(trades)).toBe(160);
  });

  it('ignores a closed trade whose realizedPnl is somehow null, rather than treating the gap as zero mixed silently into a real total', () => {
    const trades = [
      trade({ id: 't1', status: 'closed', exitPrice: 120, exitAtIso: new Date().toISOString(), realizedPnl: 200 }),
      trade({ id: 't2', status: 'closed', exitPrice: 90, exitAtIso: new Date().toISOString(), realizedPnl: null }),
    ];
    expect(computeRealizedPnl(trades)).toBe(200);
  });
});

describe('computeUnrealizedPnl', () => {
  it('returns 0 when there are no priced positions', () => {
    expect(computeUnrealizedPnl([])).toBe(0);
  });

  it('is positive for a long position priced above its average entry', () => {
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 }, currentPrice: 120 },
    ];
    expect(computeUnrealizedPnl(priced)).toBe(200);
  });

  it('is negative for a long position priced below its average entry', () => {
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 }, currentPrice: 90 },
    ];
    expect(computeUnrealizedPnl(priced)).toBe(-100);
  });

  it('is positive for a short position priced below its average entry', () => {
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'short', quantity: 10, averageEntryPrice: 100 }, currentPrice: 80 },
    ];
    expect(computeUnrealizedPnl(priced)).toBe(200);
  });

  it('is negative for a short position priced above its average entry', () => {
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'short', quantity: 10, averageEntryPrice: 100 }, currentPrice: 110 },
    ];
    expect(computeUnrealizedPnl(priced)).toBe(-100);
  });

  it('sums unrealized P&L across multiple priced positions', () => {
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'long', quantity: 10, averageEntryPrice: 100 }, currentPrice: 120 },
      { position: { symbol: 'TSLA', direction: 'short', quantity: 2, averageEntryPrice: 300 }, currentPrice: 250 },
    ];
    // AAPL: +200, TSLA: (300-250)*2 = +100
    expect(computeUnrealizedPnl(priced)).toBe(300);
  });

  it('settles to a plain 0 (never -0) when a position is priced at exactly its average entry', () => {
    const priced: PricedPosition[] = [
      { position: { symbol: 'AAPL', direction: 'short', quantity: 10, averageEntryPrice: 100 }, currentPrice: 100 },
    ];
    const value = computeUnrealizedPnl(priced);
    expect(Object.is(value, -0)).toBe(false);
    expect(value).toBe(0);
  });
});
