import { describe, it, expect } from 'vitest';
import { hashRefreshToken, verifyRefreshTokenHash } from '../src/refresh-token';

describe('refresh token hashing', () => {
  it('hashes a token deterministically (same input -> same output)', () => {
    const token = 'a-sample-refresh-token-value';
    const h1 = hashRefreshToken(token);
    const h2 = hashRefreshToken(token);
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different tokens', () => {
    const h1 = hashRefreshToken('token-one');
    const h2 = hashRefreshToken('token-two');
    expect(h1).not.toBe(h2);
  });

  it('does not return the plaintext token as its own hash', () => {
    const token = 'a-sample-refresh-token-value';
    expect(hashRefreshToken(token)).not.toBe(token);
  });

  it('is not truncated at 72 bytes the way bcrypt would be -- tokens differing only after byte 72 hash differently', () => {
    const prefix = 'x'.repeat(72);
    const h1 = hashRefreshToken(`${prefix}A`);
    const h2 = hashRefreshToken(`${prefix}B`);
    expect(h1).not.toBe(h2);
  });

  it('verifies a matching token/hash pair', () => {
    const token = 'another-refresh-token';
    const hash = hashRefreshToken(token);
    expect(verifyRefreshTokenHash(token, hash)).toBe(true);
  });

  it('rejects a non-matching token/hash pair', () => {
    const hash = hashRefreshToken('the-real-token');
    expect(verifyRefreshTokenHash('a-different-token', hash)).toBe(false);
  });

  it('rejects a malformed/corrupt stored hash instead of throwing', () => {
    expect(verifyRefreshTokenHash('some-token', 'not-a-valid-hex-hash')).toBe(false);
  });

  it('produces a fixed-length hex digest regardless of input length', () => {
    const short = hashRefreshToken('a');
    const long = hashRefreshToken('a'.repeat(500));
    expect(short).toHaveLength(64);
    expect(long).toHaveLength(64);
    expect(short).toMatch(/^[0-9a-f]{64}$/);
  });
});
