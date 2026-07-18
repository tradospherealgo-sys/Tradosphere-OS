import type { ExpertOpinion, TechnicalAnalysisResult } from '@tradosphere/shared-types';
import type { ExpertAgent } from '../agent';
import { loadPrompt } from '../prompt-loader';
import { TechnicalAgent } from './technical-agent';

// Task 5.2, Decision D7: Sprint 4 never built a dedicated "analyzeIndices"
// module in services/research -- analyzeTechnical() is symbol-agnostic and
// already works on any OHLCV series, including an index like NIFTY 50 or
// SENSEX. Rather than inventing a parallel Research Engine module and a new
// shared-types shape just to duplicate the same RSI/EMA/MACD/breakout
// interpretation, IndicesAgent's TInput is TechnicalAnalysisResult -- the
// same contract TechnicalAgent consumes -- and it delegates directly to
// TechnicalAgent's interpretation logic, only relabeling the `expert` field.
// (See EXECUTION_BOOK.md Decision D7 for the full rationale.)
export class IndicesAgent implements ExpertAgent<TechnicalAnalysisResult> {
  readonly name = 'indices' as const;

  readonly systemPrompt: string = loadPrompt('indices');

  private readonly delegate = new TechnicalAgent();

  analyze(input: TechnicalAnalysisResult): ExpertOpinion {
    const opinion = this.delegate.analyze(input);
    return { ...opinion, expert: this.name };
  }
}
