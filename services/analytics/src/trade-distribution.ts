import type { JournalEntryRecord } from './journal-source';
import { closedTradesOf } from './trade-stats';

export interface DistributionBucket {
  rangeStart: number;
  rangeEnd: number;
  count: number;
}

export interface TradeDistribution {
  buckets: DistributionBucket[];
  minPnl: number | null;
  maxPnl: number | null;
}

// Decision D18 interpretation #3: bucket boundaries are computed from the
// real min/max realizedPnl across the user's own closed trades, split into
// DEFAULT_BUCKET_COUNT equal-width buckets -- never a fixed hardcoded
// currency threshold, since no currency/denomination is configured
// anywhere in this platform. 10 is a documented, round-number default (the
// same "explicitly named, not derived from data" reasoning
// time-buckets.ts's four session windows uses), overridable per-request
// via GET /analytics/trade-distribution?buckets=N.
export const DEFAULT_BUCKET_COUNT = 10;

export function computeTradeDistribution(
  entries: JournalEntryRecord[],
  bucketCount: number = DEFAULT_BUCKET_COUNT,
): TradeDistribution {
  const closed = closedTradesOf(entries);
  if (closed.length === 0) {
    return { buckets: [], minPnl: null, maxPnl: null };
  }

  const pnls = closed.map((t) => t.realizedPnl);
  const minPnl = Math.min(...pnls);
  const maxPnl = Math.max(...pnls);

  // A single distinct P&L value (or every trade tied at the same number)
  // can't be split into a real range -- report one bucket containing every
  // trade rather than dividing a zero-width range by bucketCount.
  if (minPnl === maxPnl) {
    return {
      buckets: [{ rangeStart: minPnl, rangeEnd: maxPnl, count: closed.length }],
      minPnl,
      maxPnl,
    };
  }

  const width = (maxPnl - minPnl) / bucketCount;
  const buckets: DistributionBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    rangeStart: minPnl + i * width,
    rangeEnd: minPnl + (i + 1) * width,
    count: 0,
  }));

  for (const pnl of pnls) {
    // The maximum value falls exactly on the last bucket's upper edge --
    // clamp it into the last bucket rather than overflowing into a
    // nonexistent bucketCount-th bucket.
    const index = Math.min(Math.floor((pnl - minPnl) / width), bucketCount - 1);
    buckets[index].count++;
  }

  return { buckets, minPnl, maxPnl };
}
