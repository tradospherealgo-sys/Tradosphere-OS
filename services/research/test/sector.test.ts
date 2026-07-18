import { describe, it, expect } from 'vitest';
import { analyzeSector } from '../src/sector';
import { makeBars } from './fixtures';

describe('analyzeSector (Sprint 4 task 4.4)', () => {
  it('reports inflow rotation when the sector outperforms the benchmark', () => {
    const sectorBars = makeBars(10, { startPrice: 100, stepPerBar: 2 }); // +18%
    const benchmarkBars = makeBars(10, { startPrice: 100, stepPerBar: 0.5 }); // +4.5%
    const result = analyzeSector('IT', sectorBars, benchmarkBars);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok result');
    expect(result.sector).toBe('IT');
    expect(result.rotation).toBe('inflow');
    expect(result.relativeStrengthPct).toBeGreaterThan(2);
  });

  it('reports outflow rotation when the sector underperforms the benchmark', () => {
    const sectorBars = makeBars(10, { startPrice: 100, stepPerBar: -1 });
    const benchmarkBars = makeBars(10, { startPrice: 100, stepPerBar: 1 });
    const result = analyzeSector('METAL', sectorBars, benchmarkBars);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok result');
    expect(result.rotation).toBe('outflow');
    expect(result.relativeStrengthPct).toBeLessThan(-2);
  });

  it('reports neutral rotation when sector and benchmark move together', () => {
    const sectorBars = makeBars(10, { startPrice: 100, stepPerBar: 1 });
    const benchmarkBars = makeBars(10, { startPrice: 100, stepPerBar: 1 });
    const result = analyzeSector('BANK', sectorBars, benchmarkBars);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok result');
    expect(result.rotation).toBe('neutral');
    expect(result.relativeStrengthPct).toBe(0);
  });

  it('returns an explicit gap, never a fabricated result, when there is not enough history', () => {
    const sectorBars = makeBars(1);
    const benchmarkBars = makeBars(10);
    const result = analyzeSector('PHARMA', sectorBars, benchmarkBars);
    expect(result).toMatchObject({ status: 'gap', reason: 'missing_sector_data' });
  });
});
