import { createHash, timingSafeEqual } from 'node:crypto';

// Refresh tokens need a *lookup-by-hash* storage strategy (Task A's
// /refresh endpoint has to find a session row from an incoming raw token
// before it knows anything else about it) -- bcryptjs can't do this and was
// the wrong tool for the job (see AUDIT_REPORT.md finding F-4):
//
// 1. bcrypt silently truncates its input at 72 bytes. A signed JWT refresh
//    token is comfortably over that, so only a fixed-length prefix of the
//    token was ever actually being hashed -- the rest was ignored.
// 2. bcrypt salts every hash randomly, so hashing the same token twice
//    produces two different strings. That's exactly right for passwords
//    (nobody should ever look a password up by its hash), and exactly
//    wrong here: a lookup-by-hash repository method needs hashing the same
//    input to always produce the same output, or there is no way to find
//    the session row a raw refresh token belongs to without an O(n) scan
//    comparing it against every stored hash.
//
// Refresh tokens are also not human-chosen secrets -- they're
// high-entropy, server-generated JWTs -- so they don't need bcrypt's
// slow/salted brute-force resistance the way passwords do. A fast,
// deterministic, cryptographic hash (SHA-256) is the right primitive:
// deterministic so storage/lookup works, still infeasible to reverse or
// collide. This module must never be used for password hashing --
// packages/auth/src/password.ts (bcryptjs, salted, slow-by-design) is
// unchanged and remains the only path for that.
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

// Optional defense-in-depth check. The primary lookup path is
// `SessionRepository.findByRefreshTokenHash(hashRefreshToken(rawToken))`
// (an indexed DB equality match, not an app-level string compare) -- this
// function exists for call sites that already have a candidate hash in
// hand and want a constant-time confirmation rather than `===`, and for
// tests. Two SHA-256 hex digests are always the same length when both are
// well-formed, but the length check guards `timingSafeEqual` against
// throwing on a corrupt/truncated hash read back from a compromised row.
export function verifyRefreshTokenHash(token: string, hash: string): boolean {
  const candidate = hashRefreshToken(token);
  const candidateBuf = Buffer.from(candidate, 'hex');
  const hashBuf = Buffer.from(hash, 'hex');
  if (candidateBuf.length !== hashBuf.length) {
    return false;
  }
  return timingSafeEqual(candidateBuf, hashBuf);
}
