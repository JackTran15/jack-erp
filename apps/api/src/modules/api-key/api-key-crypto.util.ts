import { randomBytes, createHash } from 'node:crypto';

/** Raw secret + its non-secret display prefix, returned once at key creation. */
export interface GeneratedApiKey {
  raw: string;
  prefix: string;
}

/**
 * Generates a new API key secret. 32 random bytes (256 bits of entropy) is
 * plenty on its own — unlike a user password, this never needs a salt.
 */
export function generateApiKey(): GeneratedApiKey {
  const raw = randomBytes(32).toString('base64url');
  return { raw, prefix: raw.slice(0, 8) };
}

/** SHA-256 hex digest of a raw key. Only this is ever persisted, never the raw value. */
export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
