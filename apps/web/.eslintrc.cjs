// Task 10.1: apps/web is a Next.js/React app, unlike every other workspace
// package, so it gets its own ESLint config (React/JSX/browser rules) rather
// than extending the root .eslintrc.cjs (Node-only, no JSX support). `next
// lint` reads this file directly.
module.exports = {
  root: true,
  extends: ['next/core-web-vitals'],
  ignorePatterns: ['.next', 'dist', 'node_modules'],
};
