import { describe, expect, it } from 'vitest';
import { loadPrompt } from '../src/prompt-loader';

// Task 5.5 verification: prompts are tracked in git under knowledge/prompts and
// loaded from disk at runtime, not inlined ad hoc into agent source files.
describe('loadPrompt', () => {
  const allPromptNames = [
    'technical',
    'options',
    'sector',
    'quant',
    'fundamental',
    'indices',
    'strategy',
    'risk',
    'education',
  ];

  it.each(allPromptNames)('loads non-empty real content for "%s"', (name) => {
    const prompt = loadPrompt(name);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('trims surrounding whitespace from the file contents', () => {
    const prompt = loadPrompt('technical');
    expect(prompt).toBe(prompt.trim());
  });

  it('throws when asked to load a prompt that does not exist', () => {
    expect(() => loadPrompt('nonexistent-expert')).toThrow();
  });
});
