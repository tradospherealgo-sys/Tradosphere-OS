import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { CioVerdict } from '@tradosphere/sdk';
import { TradeIdeasFeed } from '../src/components/trade-ideas-feed';

// Task 10.3: TradeIdeasFeed has no network call of its own -- it only
// flattens whatever verdictHistory useMarketStream() has actually
// accumulated from real cio.verdict messages. So this is a pure render
// test (no fake server needed), same category as verdict-panel-state.test.ts,
// proving the flatten/render logic itself rather than a transport.

afterEach(() => cleanup());

function makeVerdict(overrides: Partial<CioVerdict>): CioVerdict {
  return {
    verdict: 'neutral',
    confidence: 50,
    opinions: [],
    tradeIdeas: [],
    generatedAtIso: new Date('2026-01-01T10:00:00Z').toISOString(),
    ...overrides,
  };
}

describe('<TradeIdeasFeed />', () => {
  it('renders the real "no trade ideas yet" state when verdictHistory is empty', () => {
    render(<TradeIdeasFeed verdictHistory={[]} />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText(/no trade ideas observed yet this session/i)).toBeTruthy();
  });

  it('renders the real "no trade ideas yet" state when verdicts arrived but carried none', () => {
    render(<TradeIdeasFeed verdictHistory={[makeVerdict({}), makeVerdict({})]} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('flattens trade ideas from every observed verdict into one list', () => {
    const verdictHistory: CioVerdict[] = [
      makeVerdict({
        generatedAtIso: new Date('2026-01-01T10:05:00Z').toISOString(),
        tradeIdeas: [
          {
            symbol: 'RELIANCE',
            direction: 'long',
            entry: 2500,
            stopLoss: 2450,
            target: 2600,
            riskRewardRatio: 2,
            educationNote: 'Entry confirmed by two independent experts.',
          },
        ],
      }),
      makeVerdict({
        generatedAtIso: new Date('2026-01-01T10:00:00Z').toISOString(),
        tradeIdeas: [
          {
            symbol: 'TCS',
            direction: 'short',
            entry: 3800,
            stopLoss: 3850,
            target: 3700,
            riskRewardRatio: 2,
          },
        ],
      }),
    ];

    render(<TradeIdeasFeed verdictHistory={verdictHistory} />);

    expect(screen.getByRole('list')).toBeTruthy();
    expect(screen.getByText(/RELIANCE · long/i)).toBeTruthy();
    expect(screen.getByText(/TCS · short/i)).toBeTruthy();
    expect(screen.getByText(/entry confirmed by two independent experts/i)).toBeTruthy();
    expect(screen.getByText(/entry 2500 · stop 2450 · target 2600 · R:R 2\.00/i)).toBeTruthy();
  });
});
