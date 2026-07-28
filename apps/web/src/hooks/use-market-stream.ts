'use client';

// Task 10.2 (extended in 10.3): the React-facing wrapper around
// MarketStreamConnection (src/lib/market-stream.ts). Owns the connection's
// lifecycle for exactly as long as a component using this hook is mounted
// -- opens on mount, closes on unmount, never leaks a socket across route
// changes.
import { useEffect, useState } from 'react';
import { MarketStreamConnection, type MarketStreamStatus } from '@/lib/market-stream';
import type { CioVerdict, MarketTick } from '@tradosphere/sdk';

// Task 10.3: bounds verdictHistory so a long-lived session (e.g. CIO
// Workspace left open all day) doesn't grow an unbounded array -- this is a
// display cap, not a backend retention rule.
const MAX_VERDICT_HISTORY = 25;

export interface MarketStreamState {
  status: MarketStreamStatus;
  ticksBySymbol: Record<string, MarketTick>;
  verdict: CioVerdict | null;
  /** Client-side receipt time (Date.now()), distinct from the verdict's own generatedAtIso -- lets the UI show "received Xs ago" even if the two clocks drift slightly. */
  verdictReceivedAt: number | null;
  /**
   * Every distinct cio.verdict this connection has actually observed,
   * newest first, capped at MAX_VERDICT_HISTORY. Task 10.3's trade-ideas
   * feed derives from this (flattening each verdict's real tradeIdeas)
   * rather than fabricating a feed -- same "accumulate only what genuinely
   * arrived" pattern as MarketBar's ticksBySymbol.
   */
  verdictHistory: CioVerdict[];
}

export function useMarketStream(): MarketStreamState {
  const [status, setStatus] = useState<MarketStreamStatus>('connecting');
  const [ticksBySymbol, setTicksBySymbol] = useState<Record<string, MarketTick>>({});
  const [verdict, setVerdict] = useState<CioVerdict | null>(null);
  const [verdictReceivedAt, setVerdictReceivedAt] = useState<number | null>(null);
  const [verdictHistory, setVerdictHistory] = useState<CioVerdict[]>([]);

  useEffect(() => {
    const connection = new MarketStreamConnection({
      onStatusChange: setStatus,
      onTick: (tick) => {
        setTicksBySymbol((prev) => ({ ...prev, [tick.symbol]: tick }));
      },
      onVerdict: (nextVerdict) => {
        setVerdict(nextVerdict);
        setVerdictReceivedAt(Date.now());
        setVerdictHistory((prev) => [nextVerdict, ...prev].slice(0, MAX_VERDICT_HISTORY));
      },
    });
    connection.connect();
    return () => connection.close();
  }, []);

  return { status, ticksBySymbol, verdict, verdictReceivedAt, verdictHistory };
}
