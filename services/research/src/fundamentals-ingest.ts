// Task 4.3 exit criterion: "ingested financials validate before insert."
// This is the one place an external/raw financials feed record becomes the
// trusted `CompanyFinancials` shape the repository and analyzeFundamentals()
// depend on -- mirrors services/market-data/src/normalize.ts's
// InvalidTickError precedent for the same "validate at the boundary" reason.
export class InvalidFinancialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFinancialsError';
  }
}

// Deliberately loose/optional fields -- this is what an untrusted raw feed
// record looks like before validation, not the trusted internal shape.
export interface RawFinancialsRecord {
  tradingSymbol?: string;
  reportingPeriod?: string;
  peRatio?: number;
  debtToEquity?: number;
  revenueGrowthYoyPct?: number;
  netProfitMarginPct?: number;
}

export interface CompanyFinancials {
  symbol: string;
  reportingPeriod: string;
  peRatio: number;
  debtToEquity: number;
  revenueGrowthYoyPct: number;
  netProfitMarginPct: number;
}

export function validateFinancials(raw: RawFinancialsRecord): CompanyFinancials {
  if (!raw.tradingSymbol || raw.tradingSymbol.trim().length === 0) {
    throw new InvalidFinancialsError('raw financials record missing tradingSymbol');
  }
  if (!raw.reportingPeriod || raw.reportingPeriod.trim().length === 0) {
    throw new InvalidFinancialsError('raw financials record missing reportingPeriod');
  }
  if (!Number.isFinite(raw.peRatio) || (raw.peRatio as number) < 0) {
    throw new InvalidFinancialsError(`raw financials record has invalid peRatio: ${raw.peRatio}`);
  }
  if (!Number.isFinite(raw.debtToEquity) || (raw.debtToEquity as number) < 0) {
    throw new InvalidFinancialsError(`raw financials record has invalid debtToEquity: ${raw.debtToEquity}`);
  }
  if (!Number.isFinite(raw.revenueGrowthYoyPct)) {
    throw new InvalidFinancialsError(`raw financials record has invalid revenueGrowthYoyPct: ${raw.revenueGrowthYoyPct}`);
  }
  if (!Number.isFinite(raw.netProfitMarginPct)) {
    throw new InvalidFinancialsError(`raw financials record has invalid netProfitMarginPct: ${raw.netProfitMarginPct}`);
  }

  return {
    symbol: raw.tradingSymbol,
    reportingPeriod: raw.reportingPeriod,
    peRatio: raw.peRatio as number,
    debtToEquity: raw.debtToEquity as number,
    revenueGrowthYoyPct: raw.revenueGrowthYoyPct as number,
    netProfitMarginPct: raw.netProfitMarginPct as number,
  };
}
