'use client';

// Task 10.4: paper trading order entry. Uses a dropdown for symbol selection
// with autocomplete filtering. Validates sell orders against current position.
import { useState, useMemo, useRef, useEffect } from 'react';
import { SdkHttpError } from '@tradosphere/sdk';
import type { Fill, OrderSide } from '@tradosphere/sdk';
import { sdk } from '@/lib/sdk';

// Common NSE symbols for quick selection
const COMMON_SYMBOLS = [
  'RELIANCE',
  'TCS',
  'INFY',
  'HDFCBANK',
  'ICICIBANK',
  'SBIN',
  'BHARTIARTL',
  'ITC',
  'WIPRO',
  'AXISBANK',
  'BAJFINANCE',
  'MARUTI',
  'TITAN',
  'ASIANPAINT',
  'NTPC',
  'ONGC',
  'POWERGRID',
  'M&M',
  'SUNPHARMA',
  'HINDUNILVR',
];

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
  const [showDropdown, setShowDropdown] = useState(false);
  const [side, setSide] = useState<OrderSide>('buy');
  const [quantity, setQuantity] = useState('1');
  const [orderState, setOrderState] = useState<OrderState>({ phase: 'idle' });
  const [journalState, setJournalState] = useState<JournalSaveState>({ phase: 'idle' });
  const [owning, setOwning] = useState<number | null>(null);
  const [positionCheck, setPositionCheck] = useState<
    'idle' | 'loading' | 'none' | 'long' | 'short'
  >('idle');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const filteredSymbols = useMemo(() => {
    if (!symbol) return COMMON_SYMBOLS.slice(0, 8);
    return COMMON_SYMBOLS.filter((s) => s.startsWith(symbol.toUpperCase())).slice(0, 8);
  }, [symbol]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check position synchronously before submission
  async function checkPositionBeforeSell(
    sym: string,
  ): Promise<{ canSell: boolean; owned: number; reason?: string }> {
    try {
      const summary = await sdk.portfolio.summary();
      const pos = summary.positions.find((p) => p.symbol === sym);
      if (!pos || pos.quantity <= 0) {
        return {
          canSell: false,
          owned: 0,
          reason: `You don't own any ${sym} shares to sell. Buy some first.`,
        };
      }
      return { canSell: true, owned: pos.quantity };
    } catch {
      return {
        canSell: false,
        owned: 0,
        reason: 'Could not check your portfolio. Make sure the backend is running.',
      };
    }
  }

  // Background position check for display (debounced)
  useEffect(() => {
    if (side === 'sell' && symbol.trim().length > 1) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setPositionCheck('loading');
        try {
          const summary = await sdk.portfolio.summary();
          const pos = summary.positions.find((p) => p.symbol === symbol.trim());
          if (pos) {
            setOwning(pos.quantity);
            setPositionCheck(pos.direction === 'long' ? 'long' : 'short');
          } else {
            setOwning(0);
            setPositionCheck('none');
          }
        } catch {
          setPositionCheck('idle');
          setOwning(null);
        }
      }, 300);
    } else {
      setOwning(null);
      setPositionCheck('idle');
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [side, symbol]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedSymbol = symbol.trim().toUpperCase();
    const qty = Number(quantity);
    if (!trimmedSymbol || !Number.isFinite(qty) || qty <= 0) return;

    // For sells: check position right now (fresh API call, not debounced state)
    if (side === 'sell') {
      const check = await checkPositionBeforeSell(trimmedSymbol);
      if (!check.canSell) {
        setOrderState({ phase: 'error', message: check.reason || 'Cannot sell.' });
        return;
      }
      if (qty > check.owned) {
        setOrderState({
          phase: 'error',
          message: `Cannot sell ${qty} shares — you only own ${check.owned} ${trimmedSymbol}.`,
        });
        return;
      }
    }

    setOrderState({ phase: 'loading' });
    setJournalState({ phase: 'idle' });
    try {
      const fill = await sdk.paperTrading.placeOrder({
        symbol: trimmedSymbol,
        side,
        quantity: qty,
      });
      // Update owning after sell (only if we had a valid owning value)
      if (side === 'sell' && owning !== null && Number.isFinite(owning)) {
        setOwning(Math.max(0, owning - qty));
      }
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
    <section className="space-y-4">
      {/* Side toggle */}
      <div className="flex rounded-xl bg-bg/50 p-0.5">
        <button
          type="button"
          onClick={() => setSide('buy')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
            side === 'buy' ? 'bg-success/10 text-success shadow-sm' : 'text-muted hover:text-text'
          }`}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide('sell')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
            side === 'sell' ? 'bg-danger/10 text-danger shadow-sm' : 'text-muted hover:text-text'
          }`}
        >
          Sell
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Symbol with autocomplete */}
        <div className="relative" ref={dropdownRef}>
          <label className="text-xs font-medium text-muted">Symbol</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value.toUpperCase());
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Search symbol…"
            className="mt-1 h-9 w-full rounded-xl border border-border bg-bg/50 px-3 text-sm uppercase tracking-wide transition-all focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/10"
          />
          {showDropdown && filteredSymbols.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-surface shadow-lg">
              {filteredSymbols.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSymbol(s);
                    setShowDropdown(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm uppercase tracking-wide transition-colors hover:bg-bg ${
                    symbol === s ? 'font-semibold text-accent' : 'text-text'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quantity */}
        <div>
          <label className="text-xs font-medium text-muted">Quantity</label>
          <input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mt-1 h-9 w-full rounded-xl border border-border bg-bg/50 px-3 text-sm transition-all focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/10"
          />
        </div>

        {/* Estimated values */}
        <div className="rounded-xl bg-bg/30 p-3 text-xs text-muted">
          <div className="flex justify-between">
            <span>Type</span>
            <span className="font-medium text-text capitalize">Market · {side}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>Qty</span>
            <span className="font-medium text-text">{quantity || '0'}</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitDisabled}
          className={`h-10 w-full rounded-xl text-sm font-bold transition-all ${
            side === 'buy'
              ? 'bg-success text-white shadow-lg shadow-success/20 hover:brightness-110'
              : 'bg-danger text-white shadow-lg shadow-danger/20 hover:brightness-110'
          } disabled:opacity-50`}
        >
          {orderState.phase === 'loading'
            ? 'Placing…'
            : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol || '—'}`}
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
