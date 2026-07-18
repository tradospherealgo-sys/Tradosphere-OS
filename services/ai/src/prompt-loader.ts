import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Task 5.5: the prompt library lives in `knowledge/prompts` as versioned,
// human-readable markdown -- one file per expert -- rather than as inline
// string literals scattered across each agent file. loadPrompt() is the one
// place that reads them, so every agent references a tracked file instead
// of an ad hoc inline string. `knowledge/prompts` is a plain content folder,
// not a pnpm workspace package (unlike Sprint 4's `knowledge/indicators`
// redirect, D6) -- these are reference documents read from disk, not code
// that needs to be built/typed/tested as a package.
//
// Resolves relative to this file's own location so it works the same way
// whether the caller is running against `src` (ts-node/vitest) or the
// compiled `dist` output -- both sit exactly three directories below the
// repo root (services/ai/src or services/ai/dist), and `knowledge/prompts`
// hangs off that same repo root.
const PROMPTS_ROOT = join(__dirname, '..', '..', '..', 'knowledge', 'prompts');

export function loadPrompt(name: string): string {
  const filePath = join(PROMPTS_ROOT, `${name}.md`);
  return readFileSync(filePath, 'utf-8').trim();
}
