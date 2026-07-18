import { describe, it, expect } from 'vitest';
import type { ExpertOpinion } from '@tradosphere/shared-types';
import { runAgent, type ExpertAgent } from '../src/agent';
import { DummyAgent } from '../src/agents/dummy-agent';
import { InvalidOpinionError } from '../src/opinion-schema';

describe('runAgent + ExpertAgent framework (Sprint 5 task 5.1)', () => {
  it('runs a conforming dummy agent and returns its opinion unchanged', () => {
    const agent = new DummyAgent('risk');
    const opinion = runAgent(agent, { anything: 'goes' });

    expect(opinion.expert).toBe('risk');
    expect(opinion.verdict).toBe('neutral');
    expect(opinion.confidence).toBe(50);
    expect(opinion.reasoning.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(opinion.generatedAtIso))).toBe(false);
  });

  it('lets DummyAgent stand in for any ExpertName, proving the framework is generic', () => {
    for (const name of ['technical', 'options', 'sector', 'quant', 'strategy', 'fundamental', 'indices', 'education'] as const) {
      const opinion = runAgent(new DummyAgent(name), undefined);
      expect(opinion.expert).toBe(name);
    }
  });

  it('never bypasses the shared opinion schema -- a malformed agent output is rejected, not passed through', () => {
    class RogueAgent implements ExpertAgent<unknown> {
      readonly name = 'strategy' as const;
      analyze(): ExpertOpinion {
        return {
          expert: 'strategy',
          verdict: 'bullish',
          confidence: 999, // out of range
          reasoning: ['bad'],
          generatedAtIso: new Date().toISOString(),
        };
      }
    }

    expect(() => runAgent(new RogueAgent(), undefined)).toThrow(InvalidOpinionError);
  });
});
