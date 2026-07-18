// Typed env access. Fails loudly on missing required vars -- no silent fallbacks
// for anything that isn't explicitly given a default.

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function getEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export function getEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} is not a valid number: ${raw}`);
  }
  return parsed;
}
