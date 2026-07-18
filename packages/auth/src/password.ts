import bcrypt from 'bcryptjs';

// bcryptjs (pure JS, no native addon) over bcrypt/argon2 -- avoids native
// compilation entirely, which matters in sandboxed/CI environments that
// can't always build native addons. Cost factor 12 is a deliberate balance
// between brute-force resistance and login latency; revisit only with a
// documented reason (see Cipher's Sprint 2 security review).
const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
