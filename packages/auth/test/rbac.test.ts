import { describe, it, expect } from 'vitest';
import { hasAtLeastRole, requireRole, ForbiddenError } from '../src/rbac';

describe('rbac', () => {
  it('admin satisfies every role requirement', () => {
    expect(hasAtLeastRole('admin', 'admin')).toBe(true);
    expect(hasAtLeastRole('admin', 'trader')).toBe(true);
    expect(hasAtLeastRole('admin', 'viewer')).toBe(true);
  });

  it('viewer only satisfies the viewer requirement', () => {
    expect(hasAtLeastRole('viewer', 'viewer')).toBe(true);
    expect(hasAtLeastRole('viewer', 'trader')).toBe(false);
    expect(hasAtLeastRole('viewer', 'admin')).toBe(false);
  });

  it('requireRole throws ForbiddenError when under-privileged', () => {
    expect(() => requireRole('viewer', 'admin')).toThrow(ForbiddenError);
  });

  it('requireRole does not throw when sufficiently privileged', () => {
    expect(() => requireRole('trader', 'trader')).not.toThrow();
    expect(() => requireRole('admin', 'viewer')).not.toThrow();
  });
});
