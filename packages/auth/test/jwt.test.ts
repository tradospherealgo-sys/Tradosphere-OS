import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  InvalidTokenError,
} from '../src/jwt';

const SECRET = 'test-secret-not-for-prod';

describe('jwt', () => {
  it('signs and verifies a valid access token', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'trader' }, SECRET);
    expect(verifyAccessToken(token, SECRET)).toEqual({ sub: 'user-1', role: 'trader' });
  });

  it('rejects a token signed with a different secret', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'trader' }, 'other-secret');
    expect(() => verifyAccessToken(token, SECRET)).toThrow(InvalidTokenError);
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'trader' }, SECRET);
    const tampered = `${token.slice(0, -2)}xx`;
    expect(() => verifyAccessToken(tampered, SECRET)).toThrow(InvalidTokenError);
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ sub: 'user-1', role: 'trader' }, SECRET, { expiresIn: -10 });
    expect(() => verifyAccessToken(expired, SECRET)).toThrow(InvalidTokenError);
  });

  it('rejects a payload missing the role claim', () => {
    const noRole = jwt.sign({ sub: 'user-1' }, SECRET, { expiresIn: '15m' });
    expect(() => verifyAccessToken(noRole, SECRET)).toThrow(InvalidTokenError);
  });

  it('issues and verifies a refresh token carrying only sub', () => {
    const token = signRefreshToken({ sub: 'user-1' }, SECRET);
    expect(verifyRefreshToken(token, SECRET)).toEqual({ sub: 'user-1' });
  });
});
