import type { JournalEntryRecord } from './journal-source';
import { computeTradeCounts, computeWinRate, computeAverageReturn, closedTradesOf } from './trade-stats';

export interface InstrumentStats {
  symbol: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  openTrades: number;
  totalRealizedPnl: number;
  winRate: number | null;
  averageReturn: number | null;
}

// Groups by the trade's own symbol -- the one genuinely unambiguous
// "instrument" field journal_entries has (there is no separate
// instrument-type/asset-class column to group by instead).
export function computeInstrumentAnalysis(entries: JournalEntryRecord[]): InstrumentStats[] {
  const bySymbol = new Map<string, JournalEntryRecord[]>();

  for (const entry of entries) {
    const existing = bySymbol.get(entry.symbol);
    if (existing) {
      existing.push(entry);
    } else {
      bySymbol.set(entry.symbol, [entry]);
    }
  }

  const stats: InstrumentStats[] = [];
  for (const [symbol, symbolEntries] of bySymbol.entries()) {
    const counts = computeTradeCounts(symbolEntries);
    const closed = closedTradesOf(symbolEntries);
    const totalRealizedPnl = closed.reduce((sum, t) => sum + t.realizedPnl, 0);

    stats.push({
      symbol,
      ...counts,
      totalRealizedPnl,
      winRate: computeWinRate(symbolEntries),
      averageReturn: computeAverageReturn(symbolEntries),
    });
  }

  // Most-traded instrument first, ties broken alphabetically -- same
  // deterministic ordering convention strategy-stats.ts uses.
  stats.sort((a, b) => b.totalTrades - a.totalTrades || a.symbol.localeCompare(b.symbol));
  return stats;
}
