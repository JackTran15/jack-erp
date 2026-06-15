import { EntityManager, FindOperator } from 'typeorm';
import { resolveBranchProductLocations } from './resolve-branch-product-locations';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { ProductStorageLocationEntity } from '../../inventory/product/product-storage-location.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const ORG = 'org-1';
const BRANCH_A = 'branch-a';
const BRANCH_B = 'branch-b';

const STORAGE_A = 'storage-a'; // belongs to branch A
const STORAGE_B_MAIN = 'storage-b-main'; // branch B, showroom
const STORAGE_B_BACK = 'storage-b-back'; // branch B, secondary

const PRODUCT = 'product-1';
const LOC_A = 'location-in-a';
const LOC_B_MAIN = 'location-in-b-main';
const LOC_B_BACK = 'location-in-b-back';

interface FakeStorage {
  id: string;
  branchId: string;
  organizationId: string;
  isMainStorage: boolean;
}
interface FakePsl {
  productId: string;
  storageId: string;
  locationId: string;
  organizationId: string;
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

function makeManager(storages: FakeStorage[], psl: FakePsl[]) {
  const findBy = jest.fn(async (entity: unknown, where: Record<string, unknown>) => {
    if (entity === StorageEntity)
      return storages.filter((s) => matches(s as unknown as Record<string, unknown>, where));
    if (entity === ProductStorageLocationEntity)
      return psl.filter((r) => matches(r as unknown as Record<string, unknown>, where));
    return [];
  });
  return { manager: { findBy } as unknown as EntityManager, findBy };
}

function actor(branchId?: string): ActorContext {
  return { userId: 'user-1', organizationId: ORG, branchId, roles: [] };
}

describe('resolveBranchProductLocations', () => {
  it('scopes to the acting branch — never resolves another branch\'s location (cross-branch regression)', async () => {
    // Same org-wide product mapped in both branch A and branch B storages.
    const storages: FakeStorage[] = [
      { id: STORAGE_A, branchId: BRANCH_A, organizationId: ORG, isMainStorage: true },
      { id: STORAGE_B_MAIN, branchId: BRANCH_B, organizationId: ORG, isMainStorage: true },
    ];
    const psl: FakePsl[] = [
      { productId: PRODUCT, storageId: STORAGE_A, locationId: LOC_A, organizationId: ORG },
      { productId: PRODUCT, storageId: STORAGE_B_MAIN, locationId: LOC_B_MAIN, organizationId: ORG },
    ];
    const { manager } = makeManager(storages, psl);

    const map = await resolveBranchProductLocations(manager, [PRODUCT], actor(BRANCH_B));

    expect(map.get(PRODUCT)).toBe(LOC_B_MAIN);
    expect(map.get(PRODUCT)).not.toBe(LOC_A);
  });

  it('prefers the main (showroom) storage when a product maps to several of the branch\'s storages', async () => {
    const storages: FakeStorage[] = [
      { id: STORAGE_B_MAIN, branchId: BRANCH_B, organizationId: ORG, isMainStorage: true },
      { id: STORAGE_B_BACK, branchId: BRANCH_B, organizationId: ORG, isMainStorage: false },
    ];

    // Non-main row returned first: the main row must still win.
    const backThenMain: FakePsl[] = [
      { productId: PRODUCT, storageId: STORAGE_B_BACK, locationId: LOC_B_BACK, organizationId: ORG },
      { productId: PRODUCT, storageId: STORAGE_B_MAIN, locationId: LOC_B_MAIN, organizationId: ORG },
    ];
    const r1 = await resolveBranchProductLocations(
      makeManager(storages, backThenMain).manager,
      [PRODUCT],
      actor(BRANCH_B),
    );
    expect(r1.get(PRODUCT)).toBe(LOC_B_MAIN);

    // Main row returned first: a later non-main row must not override it.
    const mainThenBack: FakePsl[] = [...backThenMain].reverse();
    const r2 = await resolveBranchProductLocations(
      makeManager(storages, mainThenBack).manager,
      [PRODUCT],
      actor(BRANCH_B),
    );
    expect(r2.get(PRODUCT)).toBe(LOC_B_MAIN);
  });

  it('omits a product with no mapping in the branch (caller fails the line closed)', async () => {
    const storages: FakeStorage[] = [
      { id: STORAGE_B_MAIN, branchId: BRANCH_B, organizationId: ORG, isMainStorage: true },
    ];
    // Product only mapped in branch A's storage.
    const psl: FakePsl[] = [
      { productId: PRODUCT, storageId: STORAGE_A, locationId: LOC_A, organizationId: ORG },
    ];
    const map = await resolveBranchProductLocations(
      makeManager(storages, psl).manager,
      [PRODUCT],
      actor(BRANCH_B),
    );
    expect(map.has(PRODUCT)).toBe(false);
  });

  it('returns an empty map and skips queries for empty productIds', async () => {
    const { manager, findBy } = makeManager([], []);
    const map = await resolveBranchProductLocations(manager, [], actor(BRANCH_B));
    expect(map.size).toBe(0);
    expect(findBy).not.toHaveBeenCalled();
  });

  it('returns an empty map and skips queries when the actor has no branch', async () => {
    const { manager, findBy } = makeManager([], []);
    const map = await resolveBranchProductLocations(manager, [PRODUCT], actor(undefined));
    expect(map.size).toBe(0);
    expect(findBy).not.toHaveBeenCalled();
  });

  it('returns an empty map when the branch has no storages (never queries PSL)', async () => {
    const { manager, findBy } = makeManager([], []);
    const map = await resolveBranchProductLocations(manager, [PRODUCT], actor(BRANCH_B));
    expect(map.size).toBe(0);
    // StorageEntity queried once; PSL never queried.
    expect(findBy).toHaveBeenCalledTimes(1);
    expect(findBy).toHaveBeenCalledWith(StorageEntity, expect.objectContaining({ branchId: BRANCH_B }));
  });
});
