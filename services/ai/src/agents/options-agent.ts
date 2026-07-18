import type { ExpertOpinion, OptionAnalysisResult } from '@tradosphere/shared-types';
import type { ExpertAgent } from '../agent';
import { loadPrompt } from '../prompt-loader';
import { buildOpinion, gapOpinion } from './shared';

// Task 5.2: consumes services/research's analyzeOptionChain() output type
// (OptionAnalysisResult). Interprets the module's already-computed
// writing/unwinding classification into a directional verdict -- call
// writing/put unwinding lean bearish (resistance building / support
// abandoned), put writing/call unwinding lean bullish (support building /
// short covering).
export class OptionsAgent implements ExpertAgent<OptionAnalysisResult> {
  readonly name = 'options' as const;

  readonly systemPrompt: string = loadPrompt('options');

  analyze(input: OptionAnalysisResult): ExpertOpinion {
    if (input.status === 'gap') return gapOpinion(this.name, input);

    const detail = `PCR ${input.putCallRatio}, call OI shift ${input.oiShift.calls}, put OI shift ${input.oiShift.puts}`;

    switch (input.interpretation) {
      case 'call_writing':
        return buildOpinion(this.name, 'moderately_bearish', 65, [
          `heavy call writing detected (${detail}) -- writers expect price capped near resistance`,
        ]);
      case 'put_writing':
        return buildOpinion(this.name, 'moderately_bullish', 65, [
          `heavy put writing detected (${detail}) -- writers expect price to hold above support`,
        ]);
      case 'call_unwinding':
        return buildOpinion(this.name, 'moderately_bullish', 55, [
          `call unwinding detected (${detail}) -- short covering suggests renewed upside`,
        ]);
      case 'put_unwinding':
        return buildOpinion(this.name, 'moderately_bearish', 55, [
          `put unwinding detected (${detail}) -- support positioning being abandoned`,
        ]);
      default:
        return buildOpinion(this.name, 'neutral', 50, [`no directional OI skew detected (${detail})`]);
    }
  }
}
