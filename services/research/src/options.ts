import type { OptionAnalysisResult, OptionChainSnapshot } from '@tradosphere/shared-types';

// Task 4.2: options-chain read. Returns an explicit ResearchGap (reason:
// 'missing_option_chain') instead of a fabricated putCallRatio/interpretation
// whenever the chain is empty or has no call-side open interest to divide by
// -- same "never fabricate" discipline as analyzeTechnical (task 4.1/4.6).
export function analyzeOptionChain(snapshot: OptionChainSnapshot): OptionAnalysisResult {
  if (snapshot.strikes.length === 0) {
    return {
      status: 'gap',
      reason: 'missing_option_chain',
      detail: `no option chain data available for ${snapshot.symbol}`,
    };
  }

  let totalCallOi = 0;
  let totalPutOi = 0;
  let totalCallOiPrevious = 0;
  let totalPutOiPrevious = 0;

  for (const strike of snapshot.strikes) {
    totalCallOi += strike.callOpenInterest;
    totalPutOi += strike.putOpenInterest;
    totalCallOiPrevious += strike.callOpenInterestPrevious;
    totalPutOiPrevious += strike.putOpenInterestPrevious;
  }

  if (totalCallOi === 0) {
    return {
      status: 'gap',
      reason: 'missing_option_chain',
      detail: `no call open interest reported for ${snapshot.symbol}`,
    };
  }

  const putCallRatio = Math.round((totalPutOi / totalCallOi) * 100) / 100;
  const oiShift = {
    calls: totalCallOi - totalCallOiPrevious,
    puts: totalPutOi - totalPutOiPrevious,
  };

  // A simple, explainable heuristic on OI shift direction -- not a prediction
  // of price, just naming what the flow looks like this snapshot vs. last.
  let interpretation: 'call_writing' | 'put_writing' | 'call_unwinding' | 'put_unwinding' | 'neutral' = 'neutral';
  if (oiShift.calls > 0 && oiShift.puts <= 0) {
    interpretation = 'call_writing';
  } else if (oiShift.puts > 0 && oiShift.calls <= 0) {
    interpretation = 'put_writing';
  } else if (oiShift.calls < 0 && oiShift.puts >= 0) {
    interpretation = 'call_unwinding';
  } else if (oiShift.puts < 0 && oiShift.calls >= 0) {
    interpretation = 'put_unwinding';
  }

  return {
    status: 'ok',
    symbol: snapshot.symbol,
    putCallRatio,
    oiShift,
    interpretation,
    generatedAtIso: new Date().toISOString(),
  };
}
