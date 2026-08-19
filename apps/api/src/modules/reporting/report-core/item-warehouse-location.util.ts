import { In, Repository } from 'typeorm';
import { LocationEntity } from '../../inventory/location/location.entity';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { ItemStorageLocationEntity } from '../../inventory/product/item-storage-location.entity';
import { StockBalanceEntity } from '../../inventory/ledger/stock-balance.entity';

export interface ItemWarehouseLocation {
  code: string | null;
  name: string | null;
}

/** The four tables the resolution below reads. */
export interface ItemWarehouseLocationRepos {
  storages: Repository<StorageEntity>;
  locations: Repository<LocationEntity>;
  itemStorageLocations: Repository<ItemStorageLocationEntity>;
  stockBalances: Repository<StockBalanceEntity>;
}

/**
 * "Vị trí"/"Mã vị trí" — where each item currently sits in one branch's
 * WAREHOUSE storage(s), explicitly excluding the showroom.
 *
 * Deliberately NOT the location recorded on the movement: a POS sale always
 * deducts from the showroom's "Mặc định" shelf, and a shelf can be rearranged
 * after the fact, so the reports resolve the item's *current* warehouse shelf
 * on every load instead of reading a snapshot.
 *
 * Priority, same as the "Hàng hóa xuất kho tạm" report:
 *   1. the item's preferred shelf (`item_storage_locations`) in one of the
 *      branch's warehouses;
 *   2. failing that, its highest-stock shelf there.
 * Only active storages and active locations count, and a pair explicitly set
 * to "Ngừng theo dõi" is skipped. Nothing left → empty cell.
 *
 * Callers pass one branch at a time because a shelf belongs to exactly one
 * branch; a row spanning several has no single location.
 */
export async function resolveItemWarehouseLocations(
  repos: ItemWarehouseLocationRepos,
  itemIds: string[],
  organizationId: string,
  branchId: string,
): Promise<Map<string, ItemWarehouseLocation>> {
  const map = new Map<string, ItemWarehouseLocation>();
  if (!itemIds.length) return map;

  const warehouses = await repos.storages.find({
    where: { organizationId, branchId, isMainStorage: false, isActive: true },
  });
  const warehouseIds = warehouses.map((w) => w.id);
  if (!warehouseIds.length) return map;

  // Only shelves still in use can be reported — a location switched off
  // ("Ngừng hoạt động") is not where the goods are.
  const activeLocations = await repos.locations.find({
    where: { storageId: In(warehouseIds), isActive: true },
  });
  const byLocationId = new Map(activeLocations.map((l) => [l.id, l]));

  const locationIdByItemId = new Map<string, string>();

  const preferred = await repos.itemStorageLocations.find({
    where: { itemId: In(itemIds), storageId: In(warehouseIds), organizationId },
  });
  for (const p of preferred) {
    if (!locationIdByItemId.has(p.itemId) && byLocationId.has(p.locationId)) {
      locationIdByItemId.set(p.itemId, p.locationId);
    }
  }

  // The preferred-shelf mapping has no isTracked flag of its own — cross-check
  // its (item, location) pair against StockBalanceEntity and drop it if that
  // specific pair was explicitly "Ngừng theo dõi". Dropped BEFORE the fallback
  // runs so such an item still resolves to its highest-stock shelf instead of
  // reporting no location at all.
  //
  // Queried as two IN lists and paired up in memory rather than as one OR
  // branch per pair: the OR form costs 4 bind parameters per pair and blows
  // past Postgres' 65535-parameter limit — a hard failure, not a slowdown —
  // once a branch has ~16k shelved items.
  if (locationIdByItemId.size) {
    const untracked = await repos.stockBalances.find({
      where: {
        organizationId,
        isTracked: false,
        itemId: In([...locationIdByItemId.keys()]),
        locationId: In([...new Set(locationIdByItemId.values())]),
      },
    });
    for (const u of untracked) {
      // The two IN lists match a cross product; only drop the exact pair.
      if (locationIdByItemId.get(u.itemId) === u.locationId) {
        locationIdByItemId.delete(u.itemId);
      }
    }
  }

  const remaining = itemIds.filter((id) => !locationIdByItemId.has(id));
  if (remaining.length) {
    const balances = await repos.stockBalances
      .createQueryBuilder('sb')
      .innerJoin(LocationEntity, 'loc', 'loc.id = sb.locationId')
      .where('sb.itemId IN (:...remaining)', { remaining })
      .andWhere('sb.organizationId = :orgId', { orgId: organizationId })
      .andWhere('sb.quantity > 0')
      .andWhere('sb.isTracked = true')
      .andWhere('loc.isActive = true')
      .andWhere('loc.storageId IN (:...warehouseIds)', { warehouseIds })
      .orderBy('sb.quantity', 'DESC')
      .select('sb.itemId', 'itemId')
      .addSelect('sb.locationId', 'locationId')
      .getRawMany<{ itemId: string; locationId: string }>();
    for (const b of balances) {
      if (!locationIdByItemId.has(b.itemId)) {
        locationIdByItemId.set(b.itemId, b.locationId);
      }
    }
  }

  for (const itemId of itemIds) {
    const locationId = locationIdByItemId.get(itemId);
    const loc = locationId ? byLocationId.get(locationId) : undefined;
    map.set(itemId, { code: loc?.code ?? null, name: loc?.name ?? null });
  }
  return map;
}
