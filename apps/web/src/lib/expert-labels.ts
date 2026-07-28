// Task 10.3: single source of truth for the ExpertName/Verdict display
// labels, extracted out of expert-status-row.tsx (10.2) so the new AI
// Council detail view and CIO workspace agree with the dashboard's summary
// row rather than each component maintaining its own copy.
import type { CioVerdict, ExpertOpinion } from '@tradosphere/sdk';

export const EXPERT_LABEL: Record<ExpertOpinion['expert'], string> = {
  technical: 'Technical',
  options: 'Options',
  sector: 'Sector',
  quant: 'Quant',
  strategy: 'Strategy',
  risk: 'Risk',
  fundamental: 'Fundamental',
  indices: 'Indices',
  education: 'Education',
};

export const VERDICT_LABEL: Record<CioVerdict['verdict'], string> = {
  bullish: 'Bullish',
  moderately_bullish: 'Moderately Bullish',
  neutral: 'Neutral',
  moderately_bearish: 'Moderately Bearish',
  bearish: 'Bearish',
};
