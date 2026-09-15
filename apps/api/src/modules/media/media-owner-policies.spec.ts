import { MediaOwnerType } from './media-object.entity';
import { MEDIA_OWNER_POLICIES } from './media-owner-policies';
import { PERMISSION_SEEDS } from '../rbac/permissions.seed';

const KNOWN_PERMISSION_KEYS = new Set(PERMISSION_SEEDS.map((seed) => seed.key));

const PUBLIC_OWNER_TYPES = [MediaOwnerType.PRODUCT, MediaOwnerType.ITEM];

const ALL_OWNER_TYPES = Object.values(MediaOwnerType);

describe('MEDIA_OWNER_POLICIES', () => {
  it('defines a policy for all 10 owner types', () => {
    expect(ALL_OWNER_TYPES).toHaveLength(10);
    for (const ownerType of ALL_OWNER_TYPES) {
      expect(MEDIA_OWNER_POLICIES[ownerType]).toBeDefined();
    }
  });

  it('makes PRODUCT and ITEM public and every other owner type private', () => {
    for (const ownerType of ALL_OWNER_TYPES) {
      const expected = PUBLIC_OWNER_TYPES.includes(ownerType) ? 'public' : 'private';
      expect(MEDIA_OWNER_POLICIES[ownerType].bucket).toBe(expected);
    }
  });

  it('only references permission keys that exist in PERMISSION_SEEDS', () => {
    const unknown = Object.values(MEDIA_OWNER_POLICIES)
      .flatMap((policy) => [...policy.writePermissions, ...policy.readPermissions])
      .filter((key) => !KNOWN_PERMISSION_KEYS.has(key));
    expect(unknown).toEqual([]);
  });

  it('requires a write permission for every owner type', () => {
    const missing = ALL_OWNER_TYPES.filter(
      (ownerType) => MEDIA_OWNER_POLICIES[ownerType].writePermissions.length === 0,
    );
    expect(missing).toEqual([]);
  });

  // "Public" must come from the bucket. A private owner type with an empty read
  // list would become readable by anyone in the organization if a caller ever
  // treated "no permissions listed" as "no check needed".
  it('requires a read permission for every private owner type', () => {
    const missing = ALL_OWNER_TYPES.filter(
      (ownerType) =>
        MEDIA_OWNER_POLICIES[ownerType].bucket === 'private' &&
        MEDIA_OWNER_POLICIES[ownerType].readPermissions.length === 0,
    );
    expect(missing).toEqual([]);
  });

  it('allows no active content in any bucket', () => {
    // Exact MIME types, not substrings: the OOXML types legitimately contain
    // "openxmlformats".
    const ACTIVE_CONTENT_TYPES = new Set([
      'image/svg+xml',
      'text/html',
      'application/xhtml+xml',
      'text/xml',
      'application/xml',
      'text/javascript',
      'application/javascript',
    ]);
    const active = Object.values(MEDIA_OWNER_POLICIES)
      .flatMap((policy) => policy.contentTypes)
      .filter((type) => ACTIVE_CONTENT_TYPES.has(type));
    expect(active).toEqual([]);
  });

  it('is frozen so a caller cannot change the rules for other owner types', () => {
    expect(Object.isFrozen(MEDIA_OWNER_POLICIES)).toBe(true);
    for (const policy of Object.values(MEDIA_OWNER_POLICIES)) {
      expect(Object.isFrozen(policy)).toBe(true);
      expect(Object.isFrozen(policy.contentTypes)).toBe(true);
      expect(Object.isFrozen(policy.writePermissions)).toBe(true);
      expect(Object.isFrozen(policy.readPermissions)).toBe(true);
    }
  });
});
