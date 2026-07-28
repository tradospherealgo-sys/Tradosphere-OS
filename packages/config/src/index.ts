// Typed env access. Fails loudly on missing required vars -- no silent fallbacks
// for anything that isn't explicitly given a default.
//
// Every service (apps/api, services/*) imports from this package before doing
// anything else with process.env, so this is the single shared place that
// loads the repo-root .env file. Nothing else in the repo calls dotenv --
// don't duplicate this in individual services.
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Walk up from the current working directory looking for a `.env` file and
 * load it into process.env (without overriding vars that are already set,
 * e.g. from the shell or docker-compose). This is required because each
 * service's `dev` script (`tsx watch src/index.ts`) runs with its own
 * package directory as cwd, not the monorepo root where `.env` lives.
 */
function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

loadRootEnv();

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
