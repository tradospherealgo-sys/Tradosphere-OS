'use client';

// Task 10.4: paper trading order entry. A single real call to POST
// /v1/paper-trading/orders (Decision D14 -- fill price is always the latest
// real market_ticks row for the symbol, never fabricated or a stale-as-fresh
// price; a symbol with no tick on record is rejected server-side, surfaced
// here as a real error, never a guessed price). Nothing is persisted by
// this call alone (D16) -- the returned Fill only becomes a durable record
// once explicitly saved to the journal, which is why the result view offers
// a second, separate "Save to journal" action rather than auto-saving.
import { useState } from 'react';
import { SdkHttpError } from '@tradosphere/sdk';
import type { Fill, OrderSide } from '@tradosphere/sdk';
import { sdk } from '@/lib/sdk';

type OrderState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'result'; fill: Fill }
  | { phase: 'error'; message: string };

type JournalSaveState =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'saved'; entryId: string }
  | { phase: 'error'; message: string };

export function OrderForm() {
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<OrderSide>('buy');
  const [quantity, setQuantity] = useState('1');
  const [orderState, setOrderState] = useState<OrderState>({ phase: 'idle' });
  const [journalState, setJournalState] = useState<JournalSaveState>({ phase: 'idle' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedSymbol = symbol.trim();
    const qty = Number(quantity);
    if (!trimmedSymbol || !Number.isFinite(qty) || qty <= 0) return;

    setOrderState({ phase: 'loading' });
    setJournalState({ phase: 'idle' });
    try {
      const fill = await sdk.paperTrading.placeOrder({
        symbol: trimmedSymbol,
        side,
        quantity: qty,
      });
      setOrderState({ phase: 'result', fill });
    } catch (err) {
      const message =
        err instanceof SdkHttpError ? err.message : 'Could not reach the paper trading service.';
      setOrderState({ phase: 'error', message });
    }
  }

  async function handleSaveToJournal(fill: Fill) {
    setJournalState({ phase: 'saving' });
    try {
      const entry = await sdk.journal.createEntry({ fill });
      setJournalState({ phase: 'saved', entryId: entry.id });
    } catch (err) {
      const message =
        err instanceof SdkHttpError ? err.message : 'Could not reach the journal service.';
      setJournalState({ phase: 'error', message });
    }
  }

  const submitDisabled =
    orderState.phase === 'loading' ||
    symbol.trim().length === 0 ||
    !Number.isFinite(Number(quantity)) ||
    Number(quantity) <= 0;

  return (
    <section
      className="rounded-lg border border-border bg-surface p-4"
      aria-labelledby="order-form-heading"
    >
      <h2 id="order-form-heading" className="text-sm font-medium">
        Place Paper Order
      </h2>
      <p className="mt-1 text-xs text-muted">
        Fills at the real latest market price for the symbol. No fabricated or cached-as-fresh price
        is ever used -- a symbol with no recent tick is rejected, not guessed.
      </p>

      <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="order-symbol" className="block text-xs text-muted">
            Symbol
          </label>
          <input
            id="order-symbol"
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="e.g. RELIANCE"
            className="mt-1 w-36 rounded-md border border-border bg-bg px-3 py-1.5 text-sm uppercase tracking-wide"
          />
        </div>

        <div>
          <label htmlFor="order-side" className="block text-xs text-muted">
            Side
          </label>
          <select
            id="order-side"
            value={side}
            onChange={(e) => setSide(e.target.value as OrderSide)}
            className="mt-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>

        <div>
          <label htmlFor="order-quantity" className="block text-xs text-muted">
            Quantity
          </label>
          <input
            id="order-quantity"
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mt-1 w-24 rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={submitDisabled}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-50"
        >
          {orderState.phase === 'loading' ? 'Placing…' : 'Place order'}
        </button>
      </form>

      <div className="mt-4">
        {orderState.phase === 'idle' && (
          <p className="text-sm text-muted" role="status">
            No order placed yet this session.
          </p>
        )}

        {orderState.phase === 'error' && (
          <p className="text-sm text-danger" role="alert">
            {orderState.message}
          </p>
        )}

        {orderState.phase === 'result' && (
          <div className="rounded-md border border-border p-3 text-sm">
            <p className="font-semibold">
              Filled {orderState.fill.quantity} {orderState.fill.symbol} · {orderState.fill.side} @{' '}
              {orderState.fill.price.toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-muted">
              Price as of {new Date(orderState.fill.priceAsOfIso).toLocaleString()} · filled{' '}
              {new Date(orderState.fill.filledAtIso).toLocaleString()}
            </p>

            <div className="mt-3">
              {journalState.phase === 'idle' && (
                <button
                  type="button"
                  onClick={() => handleSaveToJournal(orderState.fill)}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium"
                >
                  Save to journal
                </button>
              )}
              {journalState.phase === 'saving' && (
                <p className="text-sm text-muted" role="status">
                  Saving…
                </p>
              )}
              {journalState.phase === 'saved' && (
                <p className="text-sm text-success" role="status">
                  Saved to journal (entry {journalState.entryId}).
                </p>
              )}
              {journalState.phase === 'error' && (
                <p className="text-sm text-danger" role="alert">
                  {journalState.message}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
