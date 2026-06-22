import { ItemEntity } from '../item.entity';
import { LocationEntity } from '../location.entity';
import { StorageEntity } from '../storage.entity';
import { StockBalanceEntity } from '../../ledger/stock-balance.entity';
import { ItemStorageLocationEntity } from '../../product/item-storage-location.entity';
import { ResolveItemLocationsHandler } from './resolve-item-locations.handler';
import { ResolveItemLocationsQuery } from './resolve-item-locations.query';

const actor = { organizationId: 'org1', branchId: 'b1', userId: 'u1', roles: [] } as never;

interface Cfg {
  storage?: { id: string } | null;
  items?: { id: string; productId: string | null }[];
  preferred?: { locationId: string } | null;
  defaultLoc?: { id: string } | null;
  unassignedLoc?: { id: string } | null;
  stockBin?: { locationId: string } | null;
  locs?: { id: string; code: string; name: string }[];
}

function makeHandler(cfg: Cfg): ResolveItemLocationsHandler {
  const manager = {
    findOne: jest.fn(async (entity: unknown, opts: { where: Record<string, unknown> }) => {
      if (entity === StorageEntity) return cfg.storage ?? null;
      if (entity === ItemStorageLocationEntity) return cfg.preferred ?? null;
      if (entity === LocationEntity) {
        if (opts.where.isDefault) return cfg.defaultLoc ?? null;
        if (opts.where.isUnassigned) return cfg.unassignedLoc ?? null;
        return null;
      }
      return null;
    }),
    find: jest.fn(async (entity: unknown) => {
      if (entity === ItemEntity) return cfg.items ?? [];
      if (entity === LocationEntity) return cfg.locs ?? [];
      return [];
    }),
    createQueryBuilder: jest.fn(() => {
      const qb: Record<string, unknown> = {};
      for (const m of ['innerJoin', 'where', 'andWhere', 'orderBy']) {
        qb[m] = () => qb;
      }
      qb.getOne = async () => cfg.stockBin ?? null;
      return qb;
    }),
  };
  return new ResolveItemLocationsHandler({ manager } as never);
}

describe('ResolveItemLocationsHandler', () => {
  it('uses the explicit storage and shares one preferred shelf across siblings', async () => {
    const handler = makeHandler({
      storage: { id: 'S1' },
      items: [
        { id: 'v1', productId: 'p1' },
        { id: 'v2', productId: 'p1' },
      ],
      preferred: { locationId: 'L1' },
      locs: [{ id: 'L1', code: 'A1', name: 'Aisle 1' }],
    });

    const { data } = await handler.execute(
      new ResolveItemLocationsQuery(
        { variantItemIds: ['v1', 'v2'], branchId: 'b1', storageId: 'S1' },
        actor,
      ),
    );

    expect(data).toHaveLength(2);
    for (const row of data) {
      expect(row.storageId).toBe('S1');
      expect(row.locationId).toBe('L1');
      expect(row.locationCode).toBe('A1');
      expect(row.source).toBe('preferred');
    }
    // Both variants of product p1 resolved to the SAME location.
    expect(new Set(data.map((r) => r.locationId)).size).toBe(1);
  });

  it('falls back to the branch default-receiving storage and the highest-stock bin', async () => {
    const handler = makeHandler({
      storage: { id: 'S9' }, // returned for the isDefaultReceiving lookup
      items: [{ id: 'v3', productId: 'p2' }],
      preferred: null,
      defaultLoc: null,
      unassignedLoc: null,
      stockBin: { locationId: 'L7' },
      locs: [{ id: 'L7', code: 'B2', name: 'Bin 2' }],
    });

    const { data } = await handler.execute(
      new ResolveItemLocationsQuery(
        { variantItemIds: ['v3'], branchId: 'b1' },
        actor,
      ),
    );

    expect(data[0]).toMatchObject({
      itemId: 'v3',
      storageId: 'S9',
      locationId: 'L7',
      source: 'stock',
    });
  });

  it('returns source "none" when the branch has no default receiving storage', async () => {
    const handler = makeHandler({
      storage: null, // no default-receiving storage
      items: [{ id: 'v4', productId: 'p3' }],
    });

    const { data } = await handler.execute(
      new ResolveItemLocationsQuery(
        { variantItemIds: ['v4'], branchId: 'b1' },
        actor,
      ),
    );

    expect(data[0]).toMatchObject({
      itemId: 'v4',
      storageId: null,
      locationId: null,
      source: 'none',
    });
  });
});
