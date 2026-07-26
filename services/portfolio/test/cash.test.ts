import { describe, it, expect } from 'vitest';
import { computeCashBalance, DEFAULT_STARTING_CASH } from '../src/cash';
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

describe('computeCashBalance', () => {
  it('returns startingCash unchanged when there are no trades', () => {
    expect(computeCashBalance([], 50_000)).toBe(50_000);
  });

  it('defaults to DEFAULT_STARTING_CASH when no startingCash is given', () => {
    expect(computeCashBalance([])).toBe(DEFAULT_STARTING_CASH);
  });

  it('debits cash by fillPrice * quantity for an open buy', () => {
    const trades = [trade({ side: 'buy', quantity: 10, fillPrice: 100 })];
    expect(computeCashBalance(trades, 10_000)).toBe(10_000 - 1000);
  });

  it('credits cash by fillPrice * quantity for an open sell (short-sale proceeds)', () => {
    const trades = [trade({ side: 'sell', quantity: 10, fillPrice: 100 })];
    expect(computeCashBalance(trades, 10_000)).toBe(10_000 + 1000);
  });

  it('adds back exitPrice * quantity on a closed long, on top of the original debit', () => {
    const trades = [
      trade({
        side: 'buy',
        quantity: 10,
        fillPrice: 100,
        status: 'closed',
        exitPrice: 120,
        exitAtIso: new Date().toISOString(),
        realizedPnl: 200,
      }),
    ];
    // open leg: -100*10 = -1000; close leg: +120*10 = +1200
    expect(computeCashBalance(trades, 10_000)).toBe(10_000 - 1000 + 1200);
  });

  it('subtracts exitPrice * quantity on a closed short, on top of the original credit', () => {
    const trades = [
      trade({
        side: 'sell',
        quantity: 10,
        fillPrice: 100,
        status: 'closed',
        exitPrice: 80,
        exitAtIso: new Date().toISOString(),
        realizedPnl: 200,
      }),
    ];
    // open leg: +100*10 = +1000 (short-sale proceeds); close leg: -80*10 = -800 (buy to cover)
    expect(computeCashBalance(trades, 10_000)).toBe(10_000 + 1000 - 800);
  });

  it('ignores the close leg for a closed trade whose exitPrice is somehow null', () => {
    // Defensive: only applies the close leg when exitPrice !== null, even if
    // status says 'closed' -- an inconsistent record still only contributes
    // its open leg, never a fabricated close price.
    const trades = [trade({ side: 'buy', quantity: 10, fillPrice: 100, status: 'closed', exitPrice: null })];
    expect(computeCashBalance(trades, 10_000)).toBe(10_000 - 1000);
  });

  it('sums multiple trades across symbols and sides in one pass', () => {
    const trades = [
      trade({ id: 't1', symbol: 'AAPL', side: 'buy', quantity: 10, fillPrice: 100 }),
      trade({ id: 't2', symbol: 'TSLA', side: 'sell', quantity: 2, fillPrice: 300 }),
      trade({
        id: 't3',
        symbol: 'MSFT',
        side: 'buy',
        quantity: 5,
        fillPrice: 50,
        status: 'closed',
        exitPrice: 60,
        exitAtIso: new Date().toISOString(),
        realizedPnl: 50,
      }),
    ];
    // 10_000 - 1000 (AAPL open buy) + 600 (TSLA open sell) - 250 + 300 (MSFT closed buy)
    expect(computeCashBalance(trades, 10_000)).toBe(10_000 - 1000 + 600 - 250 + 300);
  });
});
