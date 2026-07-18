import type { ExpertName, ExpertOpinion } from '@tradosphere/shared-types';
import type { ExpertAgent } from '../agent';

// Task 5.1's literal exit criterion: "one dummy agent conforming" -- this
// class exists purely to prove the ExpertAgent<T>/runAgent/assertValidOpinion
// framework compiles and works end-to-end. It is not one of the nine real
// experts from SPRINT_BOOK.md; `name` is supplied via constructor rather than
// hardcoded so the same class can stand in for any expert slot in a test.
// Real agents (5.2-5.4) will each be their own class consuming a specific
// Research Engine result type as `TInput`.
export class DummyAgent implements ExpertAgent<unknown> {
  readonly name: ExpertName;

  constructor(name: ExpertName) {
    this.name = name;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- input is intentionally ignored by this stub
  analyze(input: unknown): ExpertOpinion {
    return {
      expert: this.name,
      verdict: 'neutral',
      confidence: 50,
      reasoning: ['dummy agent: no real analysis performed, this is a framework-conformance stub'],
      generatedAtIso: new Date().toISOString(),
    };
  }
}
