import type { FundamentalAnalysisResult } from '@tradosphere/shared-types';
import type { CompanyFinancials } from './fundamentals-ingest';

// Task 4.3: turns one ingested-and-validated financials record into a typed
// verdict. `financials` is `undefined` whenever the data feed hasn't ingested
// anything for this symbol/period yet -- that case returns an explicit
// ResearchGap (reason: 'missing_fundamentals'), never a fabricated verdict.
// Same "never fabricate on missing data" discipline as analyzeTechnical
// (4.1) and analyzeOptionChain (4.2).
export function analyzeFundamentals(symbol: string, financials: CompanyFinancials | undefined): FundamentalAnalysisResult {
  if (!financials) {
    return {
      status: 'gap',
      reason: 'missing_fundamentals',
      detail: `no ingested financials available for ${symbol}`,
    };
  }

  const { peRatio, debtToEquity, revenueGrowthYoyPct, netProfitMarginPct } = financials;

  let verdict: 'strong' | 'stable' | 'weak' = 'stable';
  if (revenueGrowthYoyPct < 0 || netProfitMarginPct < 0 || debtToEquity > 2) {
    verdict = 'weak';
  } else if (revenueGrowthYoyPct > 15 && netProfitMarginPct > 15 && debtToEquity < 1) {
    verdict = 'strong';
  }

  return {
    status: 'ok',
    symbol,
    peRatio,
    debtToEquity,
    revenueGrowthYoyPct,
    netProfitMarginPct,
    verdict,
    generatedAtIso: new Date().toISOString(),
  };
}
