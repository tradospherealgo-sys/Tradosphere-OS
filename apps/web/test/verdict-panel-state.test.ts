import { describe, expect, it } from 'vitest';
import { deriveVerdictPanelState } from '../src/lib/verdict-panel-state';
import type { CioVerdict } from '@tradosphere/sdk';

const verdict: CioVerdict = {
  verdict: 'bullish',
  confidence: 0.8,
  opinions: [],
  tradeIdeas: [],
  generatedAtIso: new Date(0).toISOString(),
};

describe('deriveVerdictPanelState', () => {
  it('returns "loading" while connecting/reconnecting with no verdict observed', () => {
    expect(deriveVerdictPanelState('connecting', null, null, 1000)).toBe('loading');
    expect(deriveVerdictPanelState('reconnecting', null, null, 1000)).toBe('loading');
  });

  it('returns "awaiting-verdict" once the stream is open but no verdict has arrived', () => {
    expect(deriveVerdictPanelState('open', null, null, 1000)).toBe('awaiting-verdict');
  });

  it('returns "disconnected" when the stream is down and no verdict has arrived', () => {
    expect(deriveVerdictPanelState('disconnected', null, null, 1000)).toBe('disconnected');
  });

  it('returns "active" for a verdict younger than the staleness threshold', () => {
    const receivedAt = 100_000;
    const now = receivedAt + 5 * 60 * 1000; // 5 minutes later
    expect(deriveVerdictPanelState('open', verdict, receivedAt, now)).toBe('active');
  });

  it('returns "stale" once a verdict crosses the staleness threshold', () => {
    const receivedAt = 100_000;
    const now = receivedAt + 10 * 60 * 1000; // exactly at threshold
    expect(deriveVerdictPanelState('open', verdict, receivedAt, now)).toBe('stale');
  });

  it('keeps showing "active"/"stale" from an existing verdict even if the stream later disconnects', () => {
    const receivedAt = 100_000;
    const now = receivedAt + 1000;
    expect(deriveVerdictPanelState('disconnected', verdict, receivedAt, now)).toBe('active');
  });

  it('respects a custom staleAfterMs override', () => {
    const receivedAt = 0;
    expect(deriveVerdictPanelState('open', verdict, receivedAt, 500, 1000)).toBe('active');
    expect(deriveVerdictPanelState('open', verdict, receivedAt, 1500, 1000)).toBe('stale');
  });
});
