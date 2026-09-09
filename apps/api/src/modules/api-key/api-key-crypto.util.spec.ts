import { generateApiKey, hashApiKey } from './api-key-crypto.util';

describe('generateApiKey', () => {
  it('returns a prefix that is the start of the raw key', () => {
    const { raw, prefix } = generateApiKey();
    expect(raw.startsWith(prefix)).toBe(true);
    expect(prefix).toHaveLength(8);
  });

  it('never generates the same raw key twice', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      seen.add(generateApiKey().raw);
    }
    expect(seen.size).toBe(10_000);
  });
});

describe('hashApiKey', () => {
  it('is deterministic', () => {
    const { raw } = generateApiKey();
    expect(hashApiKey(raw)).toBe(hashApiKey(raw));
  });

  it('produces different hashes for different keys', () => {
    expect(hashApiKey(generateApiKey().raw)).not.toBe(
      hashApiKey(generateApiKey().raw),
    );
  });

  it('returns a 64-char hex string (SHA-256)', () => {
    expect(hashApiKey('anything')).toMatch(/^[0-9a-f]{64}$/);
  });
});
