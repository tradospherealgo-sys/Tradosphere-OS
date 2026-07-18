import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/password';

describe('password hashing', () => {
  it('hashes a password and verifies the correct plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toBe('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects an incorrect plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const h1 = await hashPassword('same-password');
    const h2 = await hashPassword('same-password');
    expect(h1).not.toBe(h2);
    expect(await verifyPassword('same-password', h1)).toBe(true);
    expect(await verifyPassword('same-password', h2)).toBe(true);
  });
});
