import type { Role } from './jwt';

// Role type itself is exported from './jwt' (index.ts re-exports it from
// there) -- not re-exported here too, to avoid a duplicate-export clash.

// Higher rank = more privilege. Roles are ordered, not just a flat set, so
// "requires at least trader" is a single comparison instead of an allow-list
// that has to be kept in sync by hand as roles are added.
const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  trader: 1,
  admin: 2,
};

export function hasAtLeastRole(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export class ForbiddenError extends Error {
  constructor(required: Role, actual: Role) {
    super(`Requires role >= '${required}', got '${actual}'`);
    this.name = 'ForbiddenError';
  }
}

export function requireRole(actual: Role, required: Role): void {
  if (!hasAtLeastRole(actual, required)) {
    throw new ForbiddenError(required, actual);
  }
}
