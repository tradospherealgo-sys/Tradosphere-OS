import { describe, it, expect } from 'vitest';
import { analyzeTechnical } from '../src/technical';
import { makeBars } from './fixtures';

describe('analyzeTechnical (Sprint 4 tasks 4.1 / 4.6)', () => {
  it('returns a full, typed technical read when there is enough history', () => {
    const bars = makeBars(60, { startPrice: 100, stepPerBar: 0.5, volume: 1000 });
    const result = analyzeTechnical('RELIANCE', bars);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok result');
    expect(result.symbol).toBe('RELIANCE');
    expect(Number.isFinite(result.rsi14)).toBe(true);
    expect(Number.isFinite(result.ema20)).toBe(true);
    expect(Number.isFinite(result.ema50)).toBe(true);
    expect(Number.isFinite(result.macd.macdLine)).toBe(true);
    expect(Number.isFinite(result.volume.averageVolume)).toBe(true);
    expect(['up', 'down', 'none']).toContain(result.breakout.direction);
    expect(result.generatedAtIso).toBeTruthy();
  });

  it('returns an explicit gap, never a fabricated result, when there is not enough history', () => {
    const bars = makeBars(10, { startPrice: 100, stepPerBar: 1 });
    const result = analyzeTechnical('TCS', bars);

    expect(result).toMatchObject({ status: 'gap', reason: 'insufficient_history' });
  });
});
