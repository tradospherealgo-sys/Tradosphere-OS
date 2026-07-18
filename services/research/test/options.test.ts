import { describe, it, expect } from 'vitest';
import { analyzeOptionChain } from '../src/options';
import { makeOptionChain } from './fixtures';

describe('analyzeOptionChain (Sprint 4 task 4.2)', () => {
  it('computes putCallRatio and a call_writing interpretation when call OI builds up without put OI moving', () => {
    const snapshot = makeOptionChain('RELIANCE', [
      { strike: 2900, callOpenInterest: 6000, callOpenInterestPrevious: 4000, putOpenInterest: 3000, putOpenInterestPrevious: 3000 },
      { strike: 3000, callOpenInterest: 4000, callOpenInterestPrevious: 3000, putOpenInterest: 2000, putOpenInterestPrevious: 2000 },
    ]);
    const result = analyzeOptionChain(snapshot);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok result');
    expect(result.symbol).toBe('RELIANCE');
    expect(result.putCallRatio).toBe(0.5); // (3000+2000) / (6000+4000)
    expect(result.oiShift).toEqual({ calls: 3000, puts: 0 });
    expect(result.interpretation).toBe('call_writing');
  });

  it('reports put_writing when put OI builds up without call OI moving', () => {
    const snapshot = makeOptionChain('TCS', [
      { strike: 4000, callOpenInterest: 2000, callOpenInterestPrevious: 2000, putOpenInterest: 5000, putOpenInterestPrevious: 3000 },
    ]);
    const result = analyzeOptionChain(snapshot);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok result');
    expect(result.interpretation).toBe('put_writing');
  });

  it('reports neutral when both sides move in the same direction', () => {
    const snapshot = makeOptionChain('INFY', [
      { strike: 1800, callOpenInterest: 3000, callOpenInterestPrevious: 2000, putOpenInterest: 3000, putOpenInterestPrevious: 2000 },
    ]);
    const result = analyzeOptionChain(snapshot);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok result');
    expect(result.interpretation).toBe('neutral');
  });

  it('returns an explicit gap, never a fabricated result, for an empty chain', () => {
    const snapshot = makeOptionChain('TCS', []);
    const result = analyzeOptionChain(snapshot);
    expect(result).toMatchObject({ status: 'gap', reason: 'missing_option_chain' });
  });

  it('returns an explicit gap when there is no call open interest to divide by', () => {
    const snapshot = makeOptionChain('TCS', [
      { strike: 4000, callOpenInterest: 0, callOpenInterestPrevious: 0, putOpenInterest: 1000, putOpenInterestPrevious: 800 },
    ]);
    const result = analyzeOptionChain(snapshot);
    expect(result).toMatchObject({ status: 'gap', reason: 'missing_option_chain' });
  });
});
