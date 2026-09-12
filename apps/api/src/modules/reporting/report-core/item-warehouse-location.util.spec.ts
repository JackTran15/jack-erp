import {
  resolveItemWarehouseLocations,
  ItemWarehouseLocationRepos,
} from './item-warehouse-location.util';

interface StorageRow {
  id: string;
  code: string | null;
  name: string;
  isMainStorage: boolean;
  isActive: boolean;
}

interface LocationRow {
  id: string;
  code: string;
  name: string;
  storageId: string;
  isActive: boolean;
}

interface PreferredRow {
  itemId: string;
  storageId: string;
  locationId: string;
}

interface BalanceRow {
  itemId: string;
  locationId: string;
}

interface UntrackedRow {
  itemId: string;
  locationId: string;
}

interface FindOperatorLike<T> {
  value: T;
}

/**
 * Unlike a bare `mockResolvedValue`, these mocks filter by the same
 * itemId/storageId args the real query would filter by. That is needed once a
 * test drives two rounds (warehouse then showroom fallback) through the same
 * repos — without it, a row meant for one round would leak into the other.
 */
function build(opts: {
  storages: StorageRow[];
  locations: LocationRow[];
  preferred: PreferredRow[];
  balances: BalanceRow[];
  untracked?: UntrackedRow[];
}) {
  const locationById = new Map(opts.locations.map((l) => [l.id, l]));

  const storages = { find: jest.fn().mockResolvedValue(opts.storages) };

  const locations = {
    find: jest.fn((query: { where: { storageId: FindOperatorLike<string[]> } }) => {
      const storageIds = new Set(query.where.storageId.value);
      return Promise.resolve(
        opts.locations.filter((l) => storageIds.has(l.storageId) && l.isActive),
      );
    }),
  };

  const itemStorageLocations = {
    find: jest.fn(
      (query: {
        where: { itemId: FindOperatorLike<string[]>; storageId: FindOperatorLike<string[]> };
      }) => {
        const itemIds = new Set(query.where.itemId.value);
        const storageIds = new Set(query.where.storageId.value);
        return Promise.resolve(
          opts.preferred.filter((p) => itemIds.has(p.itemId) && storageIds.has(p.storageId)),
        );
      },
    ),
  };

  const stockBalances = {
    find: jest.fn(
      (query: {
        where: { itemId: FindOperatorLike<string[]>; locationId: FindOperatorLike<string[]> };
      }) => {
        const itemIds = new Set(query.where.itemId.value);
        const locationIds = new Set(query.where.locationId.value);
        return Promise.resolve(
          (opts.untracked ?? []).filter(
            (u) => itemIds.has(u.itemId) && locationIds.has(u.locationId),
          ),
        );
      },
    ),
    createQueryBuilder: jest.fn(() => {
      let filterItemIds: string[] = [];
      let filterWarehouseIds: string[] = [];
      const qb: Record<string, unknown> = {
        innerJoin: () => qb,
        select: () => qb,
        addSelect: () => qb,
        where: (_sql: string, params?: { itemIds?: string[] }) => {
          if (params?.itemIds) filterItemIds = params.itemIds;
          return qb;
        },
        andWhere: (_sql: string, params?: { warehouseIds?: string[] }) => {
          if (params?.warehouseIds) filterWarehouseIds = params.warehouseIds;
          return qb;
        },
        getRawMany: () =>
          Promise.resolve(
            opts.balances.filter((b) => {
              if (!filterItemIds.includes(b.itemId)) return false;
              const loc = locationById.get(b.locationId);
              return !!loc && filterWarehouseIds.includes(loc.storageId);
            }),
          ),
      };
      return qb;
    }),
  };

  const repos: ItemWarehouseLocationRepos = {
    storages: storages as never,
    locations: locations as never,
    itemStorageLocations: itemStorageLocations as never,
    stockBalances: stockBalances as never,
  };
  return { repos, storages, locations, itemStorageLocations, stockBalances };
}

const wh1: StorageRow = { id: 'wh-a1', code: 'A1', name: 'Kho A1', isMainStorage: false, isActive: true };
const wh2: StorageRow = { id: 'wh-a2', code: 'A2', name: 'Kho A2', isMainStorage: false, isActive: true };
const locA101: LocationRow = { id: 'loc-a101', code: 'A101', name: 'Kệ A101', storageId: 'wh-a1', isActive: true };
const locA201: LocationRow = { id: 'loc-a201', code: 'A201', name: 'Kệ A201', storageId: 'wh-a2', isActive: true };
const locB202: LocationRow = { id: 'loc-b202', code: 'B202', name: 'Kệ B202', storageId: 'wh-a2', isActive: true };
const showroom1: StorageRow = { id: 'showroom-1', code: 'SR', name: 'Showroom chính', isMainStorage: true, isActive: true };
const locShowroomDefault: LocationRow = { id: 'loc-showroom-default', code: 'MacDinh', name: 'Mặc định', storageId: 'showroom-1', isActive: true };

describe('resolveItemWarehouseLocations', () => {
  it('joins the preferred shelves of two different warehouses (AC-01)', async () => {
    const { repos } = build({
      storages: [wh1, wh2],
      locations: [locA101, locA201],
      preferred: [
        { itemId: 'item-1', storageId: 'wh-a1', locationId: 'loc-a101' },
        { itemId: 'item-1', storageId: 'wh-a2', locationId: 'loc-a201' },
      ],
      balances: [],
    });

    const result = await resolveItemWarehouseLocations(repos, ['item-1'], 'org-1', 'branch-1');

    expect(result.get('item-1')).toEqual({
      code: 'A101, A201',
      name: 'Kho A1-Kệ A101, Kho A2-Kệ A201',
    });
  });

  it('reports a single shelf as its location code alone, with the warehouse only in the name (AC-02)', async () => {
    const { repos } = build({
      storages: [wh1],
      locations: [locA101],
      preferred: [{ itemId: 'item-2', storageId: 'wh-a1', locationId: 'loc-a101' }],
      balances: [],
    });

    const result = await resolveItemWarehouseLocations(repos, ['item-2'], 'org-1', 'branch-1');

    expect(result.get('item-2')).toEqual({ code: 'A101', name: 'Kho A1-Kệ A101' });
  });

  it('unions an empty preferred shelf with a different shelf that still has stock (AC-03)', async () => {
    const { repos } = build({
      storages: [wh1, wh2],
      locations: [locA101, locB202],
      preferred: [{ itemId: 'item-3', storageId: 'wh-a1', locationId: 'loc-a101' }],
      balances: [{ itemId: 'item-3', locationId: 'loc-b202' }],
    });

    const result = await resolveItemWarehouseLocations(repos, ['item-3'], 'org-1', 'branch-1');

    expect(result.get('item-3')).toEqual({
      code: 'A101, B202',
      name: 'Kho A1-Kệ A101, Kho A2-Kệ B202',
    });
  });

  it('is deterministic across repeated calls, ordered by warehouse code then location code (AC-06)', async () => {
    const build4 = () =>
      build({
        storages: [wh1, wh2],
        locations: [locA101, locA201],
        // Preferred rows come back "A2 before A1" — the resolved order must not
        // depend on this and must still sort A1 ahead of A2.
        preferred: [
          { itemId: 'item-4', storageId: 'wh-a2', locationId: 'loc-a201' },
          { itemId: 'item-4', storageId: 'wh-a1', locationId: 'loc-a101' },
        ],
        balances: [],
      });

    const first = await resolveItemWarehouseLocations(build4().repos, ['item-4'], 'org-1', 'branch-1');
    const second = await resolveItemWarehouseLocations(build4().repos, ['item-4'], 'org-1', 'branch-1');

    const expected = { code: 'A101, A201', name: 'Kho A1-Kệ A101, Kho A2-Kệ A201' };
    expect(first.get('item-4')).toEqual(expected);
    expect(second.get('item-4')).toEqual(expected);
  });

  it('returns an empty cell when the item sits on no shelf at all', async () => {
    const { repos } = build({
      storages: [wh1],
      locations: [locA101],
      preferred: [],
      balances: [],
    });

    const result = await resolveItemWarehouseLocations(repos, ['item-5'], 'org-1', 'branch-1');

    expect(result.get('item-5')).toEqual({ code: null, name: null });
  });

  it('still reports the location code when the warehouse has no code of its own (A-06)', async () => {
    const whNoCode: StorageRow = { id: 'wh-b', code: null, name: 'Kho không mã', isMainStorage: false, isActive: true };
    const locNoCode: LocationRow = { id: 'loc-b101', code: 'A101', name: 'Kệ A101', storageId: 'wh-b', isActive: true };
    const { repos } = build({
      storages: [whNoCode],
      locations: [locNoCode],
      preferred: [{ itemId: 'item-6', storageId: 'wh-b', locationId: 'loc-b101' }],
      balances: [],
    });

    const result = await resolveItemWarehouseLocations(repos, ['item-6'], 'org-1', 'branch-1');

    // The code cell never carried a warehouse prefix since ADR-05, so a missing
    // storage code can no longer produce a leading "-" — the name cell still
    // names the warehouse.
    expect(result.get('item-6')).toEqual({ code: 'A101', name: 'Kho không mã-Kệ A101' });
  });

  it('collapses two warehouses that use the same location code into one code entry (AC-14)', async () => {
    const loc999A1: LocationRow = { id: 'loc-999-a1', code: '999', name: '999', storageId: 'wh-a1', isActive: true };
    const loc999A2: LocationRow = { id: 'loc-999-a2', code: '999', name: '999', storageId: 'wh-a2', isActive: true };
    const { repos } = build({
      storages: [wh1, wh2],
      locations: [loc999A1, loc999A2],
      preferred: [
        { itemId: 'item-11', storageId: 'wh-a1', locationId: 'loc-999-a1' },
        { itemId: 'item-11', storageId: 'wh-a2', locationId: 'loc-999-a2' },
      ],
      balances: [],
    });

    const result = await resolveItemWarehouseLocations(repos, ['item-11'], 'org-1', 'branch-1');

    // "999, 999" would be valid but meaningless; the name cell is what tells
    // the two shelves apart (A-18).
    expect(result.get('item-11')).toEqual({ code: '999', name: 'Kho A1-999, Kho A2-999' });
  });

  it('resolves a page in exactly four repository queries when no preferred shelf needs an untracked check (A-11)', async () => {
    const { repos, storages, locations, itemStorageLocations, stockBalances } = build({
      storages: [wh1],
      locations: [locA101],
      preferred: [],
      balances: [{ itemId: 'item-7', locationId: 'loc-a101' }],
    });

    await resolveItemWarehouseLocations(repos, ['item-7'], 'org-1', 'branch-1');

    expect(storages.find).toHaveBeenCalledTimes(1);
    expect(locations.find).toHaveBeenCalledTimes(1);
    expect(itemStorageLocations.find).toHaveBeenCalledTimes(1);
    expect(stockBalances.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(stockBalances.find).not.toHaveBeenCalled();
  });

  it('drops only the untracked pair, keeping the item on its other shelf (AC-04)', async () => {
    const { repos } = build({
      storages: [wh1, wh2],
      locations: [locA101, locA201],
      preferred: [
        { itemId: 'item-8', storageId: 'wh-a1', locationId: 'loc-a101' },
        { itemId: 'item-8', storageId: 'wh-a2', locationId: 'loc-a201' },
      ],
      balances: [],
      untracked: [{ itemId: 'item-8', locationId: 'loc-a101' }],
    });

    const result = await resolveItemWarehouseLocations(repos, ['item-8'], 'org-1', 'branch-1');

    expect(result.get('item-8')).toEqual({ code: 'A201', name: 'Kho A2-Kệ A201' });
  });

  it('falls back to the showroom shelf when every warehouse pair is untracked and showroomFallback is requested (AC-05)', async () => {
    const { repos } = build({
      storages: [wh1, showroom1],
      locations: [locA101, locShowroomDefault],
      preferred: [{ itemId: 'item-9', storageId: 'wh-a1', locationId: 'loc-a101' }],
      balances: [{ itemId: 'item-9', locationId: 'loc-showroom-default' }],
      untracked: [{ itemId: 'item-9', locationId: 'loc-a101' }],
    });

    const result = await resolveItemWarehouseLocations(repos, ['item-9'], 'org-1', 'branch-1', {
      showroomFallback: true,
    });

    expect(result.get('item-9')).toEqual({ code: 'MacDinh', name: 'Showroom chính-Mặc định' });
  });

  it('returns an empty cell instead of the showroom shelf when showroomFallback is not requested (AC-05)', async () => {
    const { repos } = build({
      storages: [wh1, showroom1],
      locations: [locA101, locShowroomDefault],
      preferred: [{ itemId: 'item-9', storageId: 'wh-a1', locationId: 'loc-a101' }],
      balances: [{ itemId: 'item-9', locationId: 'loc-showroom-default' }],
      untracked: [{ itemId: 'item-9', locationId: 'loc-a101' }],
    });

    const result = await resolveItemWarehouseLocations(repos, ['item-9'], 'org-1', 'branch-1');

    expect(result.get('item-9')).toEqual({ code: null, name: null });
  });

  it('never mixes in the showroom shelf when the item already has a warehouse shelf (A-08)', async () => {
    const { repos, stockBalances } = build({
      storages: [wh1, showroom1],
      locations: [locA101, locShowroomDefault],
      preferred: [{ itemId: 'item-10', storageId: 'wh-a1', locationId: 'loc-a101' }],
      balances: [{ itemId: 'item-10', locationId: 'loc-showroom-default' }],
    });

    const result = await resolveItemWarehouseLocations(repos, ['item-10'], 'org-1', 'branch-1', {
      showroomFallback: true,
    });

    expect(result.get('item-10')).toEqual({ code: 'A101', name: 'Kho A1-Kệ A101' });
    // Proves the showroom round never ran, not just that its output was discarded.
    expect(stockBalances.createQueryBuilder).toHaveBeenCalledTimes(1);
  });
});
