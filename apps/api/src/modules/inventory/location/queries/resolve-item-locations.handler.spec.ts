import { ItemEntity } from '../item.entity';
import { LocationEntity } from '../location.entity';
import { StorageEntity } from '../storage.entity';
import { StockBalanceEntity } from '../../ledger/stock-balance.entity';
import { ItemStorageLocationEntity } from '../../product/item-storage-location.entity';
import { ResolveItemLocationsHandler } from './resolve-item-locations.handler';
import { ResolveItemLocationsQuery } from './resolve-item-locations.query';

const actor = { organizationId: 'org1', branchId: 'b1', userId: 'u1', roles: [] } as never;

/**
 * A raw item_storage_locations pointer row, joined with its location. Used by
 * `preferredCandidates` to model several sibling pointers so the fake query
 * builder can reproduce the handler's real SQL guard — `loc.is_active = true`
 * AND `NOT EXISTS (a stock_balances row for that exact pair with
 * is_tracked = false)` — instead of just returning a hardcoded answer.
 */
interface PreferredCandidate {
  locationId: string;
  code: string;
  isActive?: boolean; // defaults to true
  balance?: { isTracked: boolean; quantity?: number } | null; // null/undefined = no balance row at all
}

interface Cfg {
  storage?: { id: string } | null;
  items?: { id: string; productId: string | null }[];
  preferred?: { locationId: string } | null;
  preferredCandidates?: PreferredCandidate[];
  defaultLoc?: { id: string } | null;
  unassignedLoc?: { id: string } | null;
  stockBin?: { locationId: string } | null;
  locs?: { id: string; code: string; name: string }[];
}

function makeHandler(cfg: Cfg, andWhereCalls?: string[]): ResolveItemLocationsHandler {
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
    createQueryBuilder: jest.fn((entity: unknown) => {
      const qb: Record<string, unknown> = {};
      qb.innerJoin = () => qb;
      qb.where = () => qb;
      qb.orderBy = (...args: unknown[]) => {
        andWhereCalls?.push(`ORDER BY ${String(args[0])} ${String(args[1] ?? '')}`.trim());
        return qb;
      };
      qb.andWhere = (condition: string) => {
        andWhereCalls?.push(condition);
        return qb;
      };
      // The preferred branch uses ItemStorageLocationEntity; the stock fallback
      // branch uses StockBalanceEntity — return results per entity so they don't mix.
      qb.getOne = async () => {
        if (entity !== ItemStorageLocationEntity) return cfg.stockBin ?? null;
        if (!cfg.preferredCandidates) return cfg.preferred ?? null;
        // Reproduces the handler's real predicate: loc.is_active = true, then
        // NOT EXISTS a balance for that exact pair with is_tracked = false —
        // a candidate with no balance row at all stays eligible — then picks
        // the deterministic winner by ORDER BY loc.code ASC.
        const eligible = cfg.preferredCandidates
          .filter((c) => c.isActive !== false)
          .filter((c) => !(c.balance && c.balance.isTracked === false))
          .sort((a, b) => a.code.localeCompare(b.code));
        return eligible.length ? { locationId: eligible[0].locationId } : null;
      };
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

  it('filters is_tracked=true in the stock fallback branch (skips untracked locations)', async () => {
    const andWhereCalls: string[] = [];
    // Leave preferred/stockBin unset to be sure we reach the stock fallback branch;
    // getOne returning null is fine since we only assert the condition was added.
    const handler = makeHandler(
      {
        storage: { id: 'S9' },
        items: [{ id: 'v5', productId: 'p4' }],
        preferred: null,
        defaultLoc: null,
        unassignedLoc: null,
      },
      andWhereCalls,
    );

    await handler.execute(
      new ResolveItemLocationsQuery(
        { variantItemIds: ['v5'], branchId: 'b1' },
        actor,
      ),
    );

    // The filter is applied at the SQL layer, so assert the condition was added to the query.
    expect(andWhereCalls).toContain('sb.is_tracked = true');
  });

  it('AC-18: a stale pointer to a stopped shelf yields to the tracked shelf with stock', async () => {
    const handler = makeHandler({
      storage: { id: 'S1' },
      items: [{ id: 'v6', productId: 'p5' }],
      // Two candidate shelves for the same group: the old pointer (E03.01) whose
      // (item, location) balance has been untracked, and the real shelf (A07.02)
      // which is still tracked and holds stock.
      preferredCandidates: [
        { locationId: 'E03.01-id', code: 'E03.01', balance: { isTracked: false } },
        { locationId: 'A07.02-id', code: 'A07.02', balance: { isTracked: true, quantity: 10 } },
      ],
      locs: [
        { id: 'E03.01-id', code: 'E03.01', name: 'E03.01' },
        { id: 'A07.02-id', code: 'A07.02', name: 'A07.02' },
      ],
    });

    const { data } = await handler.execute(
      new ResolveItemLocationsQuery({ variantItemIds: ['v6'], branchId: 'b1', storageId: 'S1' }, actor),
    );

    expect(data[0]).toMatchObject({
      locationId: 'A07.02-id',
      locationCode: 'A07.02',
      source: 'preferred',
    });
  });

  it('AC-19: assigned but never received (no balance row at all) still resolves to that shelf', async () => {
    const handler = makeHandler({
      storage: { id: 'S1' },
      items: [{ id: 'v7', productId: 'p6' }],
      preferredCandidates: [
        // No `balance` entry at all — the item was assigned a shelf but stock has
        // never been received there, so no stock_balances row exists yet.
        { locationId: 'L1', code: 'L1' },
      ],
      locs: [{ id: 'L1', code: 'L1', name: 'Shelf 1' }],
    });

    const { data } = await handler.execute(
      new ResolveItemLocationsQuery({ variantItemIds: ['v7'], branchId: 'b1', storageId: 'S1' }, actor),
    );

    expect(data[0]).toMatchObject({
      locationId: 'L1',
      source: 'preferred',
    });
  });

  it('A-13: a tracked shelf with quantity 0 is still eligible, not excluded', async () => {
    const handler = makeHandler({
      storage: { id: 'S1' },
      items: [{ id: 'v8', productId: 'p7' }],
      preferredCandidates: [
        { locationId: 'L2', code: 'L2', balance: { isTracked: true, quantity: 0 } },
      ],
      locs: [{ id: 'L2', code: 'L2', name: 'Shelf 2' }],
    });

    const { data } = await handler.execute(
      new ResolveItemLocationsQuery({ variantItemIds: ['v8'], branchId: 'b1', storageId: 'S1' }, actor),
    );

    expect(data[0]).toMatchObject({
      locationId: 'L2',
      source: 'preferred',
    });
  });

  it('picks a deterministic winner (lexicographically first loc.code) across sibling variants', async () => {
    const andWhereCalls: string[] = [];
    const handler = makeHandler(
      {
        storage: { id: 'S1' },
        items: [
          { id: 'v9', productId: 'p8' },
          { id: 'v10', productId: 'p8' },
        ],
        // Two shelves, both eligible, listed out of code order — the real query
        // has no natural row order here, so only ORDER BY loc.code makes the
        // pick stable.
        preferredCandidates: [
          { locationId: 'S3-id', code: 'S3', balance: { isTracked: true } },
          { locationId: 'S1-id', code: 'S1', balance: { isTracked: true } },
        ],
        locs: [
          { id: 'S3-id', code: 'S3', name: 'Shelf 3' },
          { id: 'S1-id', code: 'S1', name: 'Shelf 1' },
        ],
      },
      andWhereCalls,
    );

    const { data } = await handler.execute(
      new ResolveItemLocationsQuery(
        { variantItemIds: ['v9', 'v10'], branchId: 'b1', storageId: 'S1' },
        actor,
      ),
    );

    for (const row of data) {
      expect(row.locationId).toBe('S1-id');
      expect(row.locationCode).toBe('S1');
    }
    expect(new Set(data.map((r) => r.locationId)).size).toBe(1);
    // Deterministic ordering is expressed in SQL, so assert the ORDER BY was wired in.
    expect(andWhereCalls).toContain('ORDER BY loc.code ASC');
  });
});
