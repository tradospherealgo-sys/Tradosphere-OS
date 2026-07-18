import { describe, it, expect } from 'vitest';
import type { ResearchGapReason } from '@tradosphere/shared-types';
import { analyzeTechnical } from '../src/technical';
import { analyzeOptionChain } from '../src/options';
import { analyzeFundamentals } from '../src/fundamentals';
import { analyzeSector } from '../src/sector';
import { analyzeQuant } from '../src/quant';
import { makeBars, makeOptionChain } from './fixtures';

// Task 4.6 exit criterion: "schema validation test suite passes." Every
// module built in this sprint (4.1-4.5) returns either a typed "ok" result
// or a `ResearchGap` -- this suite doesn't re-test each module's own
// business logic (that's covered in technical.test.ts, options.test.ts,
// fundamentals.test.ts, sector.test.ts, quant.test.ts). It instead asserts,
// generically and across all five, that the *shape* every module produces
// actually conforms to the shared contract in packages/shared-types: a
// valid "ok"/"gap" discriminant, a parseable generatedAtIso on every "ok"
// result, and a known reason + non-empty detail on every gap -- so no module
// can quietly drift from the standardized research schema.
const VALID_GAP_REASONS: ResearchGapReason[] = [
  'insufficient_history',
  'missing_option_chain',
  'missing_fundamentals',
  'missing_sector_data',
];

interface OkLike {
  status: 'ok';
  generatedAtIso: string;
}

interface GapLike {
  status: 'gap';
  reason: string;
  detail: string;
}

function assertOkShape(result: OkLike): void {
  expect(result.status).toBe('ok');
  expect(typeof result.generatedAtIso).toBe('string');
  expect(Number.isNaN(Date.parse(result.generatedAtIso))).toBe(false);
}

function assertGapShape(result: GapLike): void {
  expect(result.status).toBe('gap');
  expect(VALID_GAP_REASONS).toContain(result.reason);
  expect(typeof result.detail).toBe('string');
  expect(result.detail.length).toBeGreaterThan(0);
}

describe('Research module output standardization (Sprint 4 task 4.6)', () => {
  const okCases = [
    { name: 'technical', result: analyzeTechnical('RELIANCE', makeBars(60, { startPrice: 100, stepPerBar: 0.5 })) },
    {
      name: 'options',
      result: analyzeOptionChain(
        makeOptionChain('TCS', [{ strike: 4000, callOpenInterest: 1000, putOpenInterest: 500 }]),
      ),
    },
    {
      name: 'fundamentals',
      result: analyzeFundamentals('INFY', {
        symbol: 'INFY',
        reportingPeriod: 'FY2026Q1',
        peRatio: 25,
        debtToEquity: 0.5,
        revenueGrowthYoyPct: 10,
        netProfitMarginPct: 12,
      }),
    },
    { name: 'sector', result: analyzeSector('IT', makeBars(10, { stepPerBar: 1 }), makeBars(10, { stepPerBar: 0.5 })) },
    { name: 'quant', result: analyzeQuant('TCS', makeBars(21, { startPrice: 100, stepPerBar: 0 })) },
  ] as const;

  const gapCases = [
    { name: 'technical', result: analyzeTechnical('TCS', makeBars(10, { stepPerBar: 1 })) },
    { name: 'options', result: analyzeOptionChain(makeOptionChain('TCS', [])) },
    { name: 'fundamentals', result: analyzeFundamentals('NEWCO', undefined) },
    { name: 'sector', result: analyzeSector('PHARMA', makeBars(1), makeBars(10)) },
    { name: 'quant', result: analyzeQuant('TCS', makeBars(10, { stepPerBar: 1 }), 20) },
  ] as const;

  it.each(okCases)('$name returns a standardized "ok" shape with a valid generatedAtIso', ({ result }) => {
    if (result.status !== 'ok') throw new Error('expected ok result');
    assertOkShape(result);
  });

  it.each(gapCases)('$name returns a standardized ResearchGap shape, never a fabricated result', ({ result }) => {
    if (result.status !== 'gap') throw new Error('expected gap result');
    assertGapShape(result);
  });

  it('every module\'s status field is a valid discriminant ("ok" or "gap"), nothing else', () => {
    for (const { result } of [...okCases, ...gapCases]) {
      expect(['ok', 'gap']).toContain(result.status);
    }
  });
});
