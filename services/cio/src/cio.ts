import type { CioVerdict, ExpertOpinion } from '@tradosphere/shared-types';
import { computeConsensus } from './consensus';
import {
  evaluateRiskGate,
  DEFAULT_MIN_CONFIDENCE,
  DEFAULT_MIN_RISK_REWARD_RATIO,
  type PortfolioRiskContext,
  type RiskGateResult,
} from './risk-gate';
import { buildExplainabilityTrace, type ExplainabilityTrace } from './trace';
import { generateTradeIdea } from './trade-idea';

// Task 6.5 (Atlas's review walkthrough): 6.1-6.4 built four independently
// tested primitives (consensus, risk gate, trace, trade idea) but nothing
// yet composed them into the single "CIO gives final verdict" engine that is
// Sprint 6's own stated Objective and that packages/shared-types' CioVerdict
// interface exists for. risk-gate.ts's own header comment already names this
// missing piece -- "the CIO orchestration layer must never construct a path
// that proceeds past [a Level 1 veto]" -- so closing it here is completing
// the sprint's plan, not scope creep: no new algorithm/design decision is
// made in this file, it only wires 6.1-6.4's already-approved, already-built
// pieces together in the order Decision D8 specifies. Logged as Decision D10.

export interface BuildCioVerdictInput {
  symbol: string;
  opinions: ExpertOpinion[];
  referencePrice: number;
  portfolio: PortfolioRiskContext;
  // False whenever any upstream input was a ResearchGap or otherwise failed
  // validation -- passed straight through to the risk gate's Level 1 check.
  // Callers must derive this from real upstream state, never hardcode true.
  dataValid: boolean;
  minConfidence?: number;
  minRiskRewardRatio?: number;
  stopLossPct?: number;
  targetRiskRewardRatio?: number;
}

// A superset of the shared-types CioVerdict contract, not a modification of
// it: every other service can still treat this as a plain CioVerdict, while
// services/cio's own callers get the trace and risk gate detail behind it.
// Decision D10 deliberately did not add `trace`/`riskGate` to CioVerdict
// itself in packages/shared-types -- that contract change would ripple to
// every future consumer (Sprint 9 apps/api, Sprint 10 apps/web) before any
// of them exist yet or have asked for it.
export interface CioVerdictWithTrace extends CioVerdict {
  trace: ExplainabilityTrace;
  riskGate: RiskGateResult;
}

export function buildCioVerdict(input: BuildCioVerdictInput): CioVerdictWithTrace {
  const consensus = computeConsensus(input.opinions);
  const riskOpinion = input.opinions.find((o) => o.expert === 'risk');

  // Decision D13 (Sprint 7 exit criterion 3 fix): the Education agent's
  // opinion already flows into this function via input.opinions -- weight 0
  // in computeConsensus() (Decision D8) keeps it out of the directional
  // score, but its reasoning is still real data sitting right here.
  // generateTradeIdea() (task 6.4) has accepted an optional educationNote
  // since Sprint 6; nothing before this fix ever passed one in. Wiring the
  // already-present opinion to the already-present parameter needs no new
  // import and no new package.json dependency, so it doesn't touch Decision
  // D9 (services/cio depends on shared-types only) or Decision D12
  // (services/cio and services/education stay isolated as *services* --
  // this reads data, not a service call). No education opinion supplied, or
  // one with empty reasoning, leaves educationNote unset: per Forge's
  // charter rule 2 (no silent fallbacks), "not annotated" is the honest
  // result, never a fabricated note.
  const educationOpinion = input.opinions.find((o) => o.expert === 'education');
  const educationNote = educationOpinion?.reasoning[0];

  // Generated before the gate runs so the gate can evaluate the idea's own
  // R:R against minRiskRewardRatio (Level 1) -- but generating it is not the
  // same as shipping it; that is the gate's call, not this function's.
  const candidateIdea = generateTradeIdea({
    symbol: input.symbol,
    verdict: consensus.verdict,
    referencePrice: input.referencePrice,
    stopLossPct: input.stopLossPct,
    targetRiskRewardRatio: input.targetRiskRewardRatio,
    educationNote,
  });

  const riskGate = evaluateRiskGate({
    consensusConfidence: consensus.confidence,
    minConfidence: input.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
    portfolio: input.portfolio,
    dataValid: input.dataValid,
    minRiskRewardRatio: input.minRiskRewardRatio ?? DEFAULT_MIN_RISK_REWARD_RATIO,
    candidateTradeIdea: candidateIdea ? { riskRewardRatio: candidateIdea.riskRewardRatio } : undefined,
    riskOpinion,
  });

  const trace = buildExplainabilityTrace(input.opinions, consensus, riskGate);

  // Decision D8, verbatim: "the CIO must never override a Level 1 veto."
  // A hard veto means zero trade ideas ship, full stop -- regardless of how
  // clean candidateIdea's own numbers looked in isolation. Level 2 ships the
  // idea as-is: the prescribed position-size/leverage mitigation adjusts
  // execution, not the entry/stop/target levels TradeIdea models (task 6.4's
  // own scoping note), so there is nothing to modify on the idea itself here.
  const tradeIdeas = riskGate.approved && candidateIdea ? [candidateIdea] : [];

  return {
    verdict: consensus.verdict,
    confidence: consensus.confidence,
    opinions: input.opinions,
    tradeIdeas,
    generatedAtIso: new Date().toISOString(),
    trace,
    riskGate,
  };
}
