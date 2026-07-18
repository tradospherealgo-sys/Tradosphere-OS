// Thrown by every indicator function below when it doesn't have enough
// bars to compute a real value. The technical analysis aggregator
// (../technical.ts) catches this and returns an explicit ResearchGap
// instead of a fabricated or partially-computed indicator reading.
export class InsufficientDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientDataError';
  }
}
