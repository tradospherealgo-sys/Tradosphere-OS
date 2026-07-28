import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Task 10.1: jsdom gives token-store.ts's `window`/`localStorage` checks a
// real browser-shaped environment to run against in tests, same as the
// actual client runtime, rather than a second "node-only" code path.
//
// Task 10.3: research-lookup.test.tsx is the first test to render a
// component that imports via the "@/*" path alias (tsconfig.json maps this
// to "./src/*" for the Next.js build/type-checker, but Vitest's own Vite
// instance doesn't read tsconfig "paths" -- it needs the same alias
// mirrored here or "@/lib/sdk" fails to resolve under test).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
  },
});
