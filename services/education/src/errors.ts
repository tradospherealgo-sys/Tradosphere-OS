// Domain errors for services/education. One error class per *kind* of
// failure, parameterized by entity name, rather than one class per content
// type (glossary/course/lesson/strategy/quiz) -- the five content
// repositories in repository.ts hit the exact same three failure kinds
// (not found, slug taken, and the generic case below), so five sets of
// near-identical classes would be pure duplication for zero behavioral gain.
// Matches the schema's own reasoning in education-schema.ts for using one
// generic mechanism instead of five near-identical ones where the shape is
// truly shared.

export class NotFoundError extends Error {
  constructor(entity: string, identifier: string) {
    super(`${entity} not found: ${identifier}`);
    this.name = 'NotFoundError';
  }
}

export class SlugInUseError extends Error {
  constructor(entity: string, slug: string) {
    super(`${entity} slug already in use: ${slug}`);
    this.name = 'SlugInUseError';
  }
}

// Covers the polymorphic tables' own uniqueness rules that aren't a "slug"
// concept: a tag already attached to a piece of content, a duplicate
// (content_type, content_id, version) revision row, etc.
export class DuplicateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateError';
  }
}

// Task 7.1 (quiz attempts): a caller submitted a different number of answers
// than the quiz actually has questions. Rejected before scoring rather than
// silently scoring a partial/misaligned submission -- Forge's charter rule 2
// (no silent fallback) applies here even though this isn't a broker/market
// data call: a wrong score written to quiz_attempts is a fabricated result.
export class AnswerCountMismatchError extends Error {
  constructor(expected: number, actual: number) {
    super(`expected ${expected} answers, received ${actual}`);
    this.name = 'AnswerCountMismatchError';
  }
}
