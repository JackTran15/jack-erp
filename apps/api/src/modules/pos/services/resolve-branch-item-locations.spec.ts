import { EntityManager, FindOperator } from 'typeorm';
import { resolveBranchItemLocations } from './resolve-branch-item-locations';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { LocationEntity } from '../../inventory/location/location.entity';
import { ItemStorageLocationEntity } from '../../inventory/product/item-storage-location.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const ORG = 'org-1';
const BRANCH_A = 'branch-a';
const BRANCH_B = 'branch-b';

const STORAGE_A = 'storage-a'; // belongs to branch A
const STORAGE_B_MAIN = 'storage-b-main'; // branch B, showroom
const STORAGE_B_BACK = 'storage-b-back'; // branch B, secondary

const ITEM = 'item-1';
const LOC_A = 'location-in-a';
const LOC_B_MAIN = 'location-in-b-main';
const LOC_B_BACK = 'location-in-b-back';
const LOC_B_DEFAULT = 'location-in-b-default';

interface FakeStorage {
  id: string;
  branchId: string;
  organizationId: string;
  isMainStorage: boolean;
}
interface FakeIsl {
  itemId: string;
  storageId: string;
  locationId: string;
  organizationId: string;
}
interface FakeLocation {
  id: string;
  storageId: string;
  organizationId: string;
  isDefault: boolean;
}

/** Honours plain equality and `In(...)` (FindOperator) conditions, mirroring TypeORM's findBy. */
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond instanceof FindOperator) {
      return (cond.value as unknown[]).includes(row[key]);
    }
    return row[key] === cond;
  });
}

function makeManager(storages: FakeStorage[], isl: FakeIsl[], locations: FakeLocation[] = []) {
  const findBy = jest.fn(async (entity: unknown, where: Record<string, unknown>) => {
    if (entity === StorageEntity)
      return storages.filter((s) => matches(s as unknown as Record<string, unknown>, where));
    if (entity === ItemStorageLocationEntity)
      return isl.filter((r) => matches(r as unknown as Record<string, unknown>, where));
    return [];
  });
  const findOne = jest.fn(async (entity: unknown, options: { where: Record<string, unknown> }) => {
    if (entity === LocationEntity)
      return (
        locations.find((l) => matches(l as unknown as Record<string, unknown>, options.where)) ?? null
      );
    return null;
  });
  return { manager: { findBy, findOne } as unknown as EntityManager, findBy, findOne };
}

function actor(branchId?: string): ActorContext {
  return { userId: 'user-1', organizationId: ORG, branchId, roles: [] };
}

describe('resolveBranchItemLocations', () => {
  it('scopes to the acting branch — never resolves another branch\'s location (cross-branch regression)', async () => {
    // Same org-wide item mapped in both branch A and branch B storages.
    const storages: FakeStorage[] = [
      { id: STORAGE_A, branchId: BRANCH_A, organizationId: ORG, isMainStorage: true },
      { id: STORAGE_B_MAIN, branchId: BRANCH_B, organizationId: ORG, isMainStorage: true },
    ];
    const isl: FakeIsl[] = [
      { itemId: ITEM, storageId: STORAGE_A, locationId: LOC_A, organizationId: ORG },
      { itemId: ITEM, storageId: STORAGE_B_MAIN, locationId: LOC_B_MAIN, organizationId: ORG },
    ];
    const { manager } = makeManager(storages, isl);

    const map = await resolveBranchItemLocations(manager, [ITEM], actor(BRANCH_B));

    expect(map.get(ITEM)).toBe(LOC_B_MAIN);
    expect(map.get(ITEM)).not.toBe(LOC_A);
  });

  it('prefers the main (showroom) storage when an item maps to several of the branch\'s storages', async () => {
    const storages: FakeStorage[] = [
      { id: STORAGE_B_MAIN, branchId: BRANCH_B, organizationId: ORG, isMainStorage: true },
      { id: STORAGE_B_BACK, branchId: BRANCH_B, organizationId: ORG, isMainStorage: false },
    ];

    // Non-main row returned first: the main row must still win.
    const backThenMain: FakeIsl[] = [
      { itemId: ITEM, storageId: STORAGE_B_BACK, locationId: LOC_B_BACK, organizationId: ORG },
      { itemId: ITEM, storageId: STORAGE_B_MAIN, locationId: LOC_B_MAIN, organizationId: ORG },
    ];
    const r1 = await resolveBranchItemLocations(
      makeManager(storages, backThenMain).manager,
      [ITEM],
      actor(BRANCH_B),
    );
    expect(r1.get(ITEM)).toBe(LOC_B_MAIN);

    // Main row returned first: a later non-main row must not override it.
    const mainThenBack: FakeIsl[] = [...backThenMain].reverse();
    const r2 = await resolveBranchItemLocations(
      makeManager(storages, mainThenBack).manager,
      [ITEM],
      actor(BRANCH_B),
    );
    expect(r2.get(ITEM)).toBe(LOC_B_MAIN);
  });

  it('falls back to the showroom default location for an item with no row in this branch', async () => {
    const storages: FakeStorage[] = [
      { id: STORAGE_B_MAIN, branchId: BRANCH_B, organizationId: ORG, isMainStorage: true },
    ];
    const locations: FakeLocation[] = [
      { id: LOC_B_DEFAULT, storageId: STORAGE_B_MAIN, organizationId: ORG, isDefault: true },
    ];
    // Item only mapped in branch A's storage — no row in branch B.
    const isl: FakeIsl[] = [
      { itemId: ITEM, storageId: STORAGE_A, locationId: LOC_A, organizationId: ORG },
    ];
    const map = await resolveBranchItemLocations(
      makeManager(storages, isl, locations).manager,
      [ITEM],
      actor(BRANCH_B),
    );
    expect(map.get(ITEM)).toBe(LOC_B_DEFAULT);
  });

  it('prefers an explicit row over the default fallback', async () => {
    const storages: FakeStorage[] = [
      { id: STORAGE_B_MAIN, branchId: BRANCH_B, organizationId: ORG, isMainStorage: true },
    ];
    const locations: FakeLocation[] = [
      { id: LOC_B_DEFAULT, storageId: STORAGE_B_MAIN, organizationId: ORG, isDefault: true },
    ];
    const isl: FakeIsl[] = [
      { itemId: ITEM, storageId: STORAGE_B_MAIN, locationId: LOC_B_MAIN, organizationId: ORG },
    ];
    const map = await resolveBranchItemLocations(
      makeManager(storages, isl, locations).manager,
      [ITEM],
      actor(BRANCH_B),
    );
    expect(map.get(ITEM)).toBe(LOC_B_MAIN);
    expect(map.get(ITEM)).not.toBe(LOC_B_DEFAULT);
  });

  it('omits an item with no row and no showroom default location (caller fails the line closed)', async () => {
    const storages: FakeStorage[] = [
      { id: STORAGE_B_MAIN, branchId: BRANCH_B, organizationId: ORG, isMainStorage: true },
    ];
    // Item only mapped in branch A's storage; branch B has no default location.
    const isl: FakeIsl[] = [
      { itemId: ITEM, storageId: STORAGE_A, locationId: LOC_A, organizationId: ORG },
    ];
    const map = await resolveBranchItemLocations(
      makeManager(storages, isl).manager,
      [ITEM],
      actor(BRANCH_B),
    );
    expect(map.has(ITEM)).toBe(false);
  });

  it('returns an empty map and skips queries for empty itemIds', async () => {
    const { manager, findBy } = makeManager([], []);
    const map = await resolveBranchItemLocations(manager, [], actor(BRANCH_B));
    expect(map.size).toBe(0);
    expect(findBy).not.toHaveBeenCalled();
  });

  it('returns an empty map and skips queries when the actor has no branch', async () => {
    const { manager, findBy } = makeManager([], []);
    const map = await resolveBranchItemLocations(manager, [ITEM], actor(undefined));
    expect(map.size).toBe(0);
    expect(findBy).not.toHaveBeenCalled();
  });

  it('returns an empty map when the branch has no storages (never queries rows)', async () => {
    const { manager, findBy } = makeManager([], []);
    const map = await resolveBranchItemLocations(manager, [ITEM], actor(BRANCH_B));
    expect(map.size).toBe(0);
    // StorageEntity queried once; item rows never queried.
    expect(findBy).toHaveBeenCalledTimes(1);
    expect(findBy).toHaveBeenCalledWith(StorageEntity, expect.objectContaining({ branchId: BRANCH_B }));
  });

  describe('showroomOnly (POS sale path)', () => {
    it('ignores a warehouse-only shelf and falls back to the showroom default location', async () => {
      const storages: FakeStorage[] = [
        { id: STORAGE_B_MAIN, branchId: BRANCH_B, organizationId: ORG, isMainStorage: true },
        { id: STORAGE_B_BACK, branchId: BRANCH_B, organizationId: ORG, isMainStorage: false },
      ];
      const locations: FakeLocation[] = [
        { id: LOC_B_DEFAULT, storageId: STORAGE_B_MAIN, organizationId: ORG, isDefault: true },
      ];
      // Item shelved only in the warehouse (non-main) storage.
      const isl: FakeIsl[] = [
        { itemId: ITEM, storageId: STORAGE_B_BACK, locationId: LOC_B_BACK, organizationId: ORG },
      ];
      const map = await resolveBranchItemLocations(
        makeManager(storages, isl, locations).manager,
        [ITEM],
        actor(BRANCH_B),
        { showroomOnly: true },
      );
      expect(map.get(ITEM)).toBe(LOC_B_DEFAULT);
      expect(map.get(ITEM)).not.toBe(LOC_B_BACK);
    });

    it('still uses an explicit showroom (main-storage) shelf when one exists', async () => {
      const storages: FakeStorage[] = [
        { id: STORAGE_B_MAIN, branchId: BRANCH_B, organizationId: ORG, isMainStorage: true },
        { id: STORAGE_B_BACK, branchId: BRANCH_B, organizationId: ORG, isMainStorage: false },
      ];
      const locations: FakeLocation[] = [
        { id: LOC_B_DEFAULT, storageId: STORAGE_B_MAIN, organizationId: ORG, isDefault: true },
      ];
      const isl: FakeIsl[] = [
        { itemId: ITEM, storageId: STORAGE_B_BACK, locationId: LOC_B_BACK, organizationId: ORG },
        { itemId: ITEM, storageId: STORAGE_B_MAIN, locationId: LOC_B_MAIN, organizationId: ORG },
      ];
      const map = await resolveBranchItemLocations(
        makeManager(storages, isl, locations).manager,
        [ITEM],
        actor(BRANCH_B),
        { showroomOnly: true },
      );
      expect(map.get(ITEM)).toBe(LOC_B_MAIN);
    });

    it('omits a warehouse-only item when the showroom has no default location (fails closed)', async () => {
      const storages: FakeStorage[] = [
        { id: STORAGE_B_MAIN, branchId: BRANCH_B, organizationId: ORG, isMainStorage: true },
        { id: STORAGE_B_BACK, branchId: BRANCH_B, organizationId: ORG, isMainStorage: false },
      ];
      const isl: FakeIsl[] = [
        { itemId: ITEM, storageId: STORAGE_B_BACK, locationId: LOC_B_BACK, organizationId: ORG },
      ];
      const map = await resolveBranchItemLocations(
        makeManager(storages, isl).manager,
        [ITEM],
        actor(BRANCH_B),
        { showroomOnly: true },
      );
      expect(map.has(ITEM)).toBe(false);
    });
  });
});
