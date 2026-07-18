import { describe, it, expect } from 'vitest';
import { analyzeQuant } from '../src/quant';
import { makeBars } from './fixtures';

describe('analyzeQuant (Sprint 4 task 4.5)', () => {
  it('reports a zero z-score, zero volatility, and a hold signal for a perfectly flat series', () => {
    const bars = makeBars(21, { startPrice: 100, stepPerBar: 0 });
    const result = analyzeQuant('RELIANCE', bars);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok result');
    expect(result.symbol).toBe('RELIANCE');
    expect(result.zScore).toBe(0);
    expect(result.volatilityAnnualizedPct).toBe(0);
    expect(result.meanReversionSignal).toBe('hold');
  });

  it('reports a buy signal when the latest close drops far below its rolling mean', () => {
    const bars = makeBars(20, { startPrice: 100, stepPerBar: 0 });
    bars.push({ timestampIso: new Date(2026, 1, 1).toISOString(), open: 100, high: 100, low: 60, close: 60, volume: 1000 });
    const result = analyzeQuant('TCS', bars);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok result');
    expect(result.zScore).toBeLessThan(-1.5);
    expect(result.meanReversionSignal).toBe('buy');
  });

  it('reports a sell signal when the latest close spikes far above its rolling mean', () => {
    const bars = makeBars(20, { startPrice: 100, stepPerBar: 0 });
    bars.push({ timestampIso: new Date(2026, 1, 1).toISOString(), open: 100, high: 140, low: 100, close: 140, volume: 1000 });
    const result = analyzeQuant('INFY', bars);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok result');
    expect(result.zScore).toBeGreaterThan(1.5);
    expect(result.meanReversionSignal).toBe('sell');
  });

  it('returns an explicit gap, never a fabricated result, when there is not enough history', () => {
    const bars = makeBars(10, { startPrice: 100, stepPerBar: 1 });
    const result = analyzeQuant('TCS', bars, 20);
    expect(result).toMatchObject({ status: 'gap', reason: 'insufficient_history' });
  });
});
