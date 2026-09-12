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
 * One shelf an item sits on, with its storage's code/name already attached.
 * Internal to this file — callers only ever see the joined
 * `ItemWarehouseLocation` string built from a list of these.
 */
interface ItemShelf {
  storageCode: string | null;
  storageName: string;
  locationCode: string;
  locationName: string;
}

/**
 * "Vị trí"/"Mã vị trí" — every shelf an item currently sits on, across one
 * branch's WAREHOUSE storage(s), explicitly excluding the showroom.
 *
 * Deliberately NOT the location recorded on the movement: a POS sale always
 * deducts from the showroom's "Mặc định" shelf, and a shelf can be rearranged
 * after the fact, so the reports resolve the item's *current* warehouse
 * shelves on every load instead of reading a snapshot.
 *
 * A shelf counts if it is either:
 *   1. the item's preferred shelf (`item_storage_locations`) in that
 *      warehouse, or
 *   2. any shelf there still holding stock (`stock_balances.quantity > 0`).
 * These are a union, not a priority order — an item whose preferred shelf is
 * empty but has real stock elsewhere reports both. Only active storages and
 * active locations count, and a pair explicitly set to "Ngừng theo dõi" is
 * skipped. Every matching shelf is joined into one cell: `code` lists the
 * location codes alone (`"A101, A201"`), de-duplicated, and `name` lists one
 * `"TênKho-TênVịTrí"` per shelf (`"Kho A1-Kệ A101, Kho A2-Kệ A201"`) — a
 * location code is only unique within its storage, so the name cell is where
 * the warehouse is identified. Nothing left → empty cell.
 *
 * Callers pass one branch at a time because a shelf belongs to exactly one
 * branch; a row spanning several has no single location.
 *
 * `showroomFallback` relaxes the exclusion into a preference: warehouses still
 * win, but an item that lives only on the showroom floor reports that shelf
 * instead of an empty cell. The stock reports want this — their location column
 * is a "where do I go and pick this up" hint, so the showroom is a better answer
 * than nothing. The revenue and profit reports do not, because there the
 * showroom shelf is an artefact of how a POS sale is booked, not a fact about
 * where the goods sit.
 */
export async function resolveItemWarehouseLocations(
  repos: ItemWarehouseLocationRepos,
  itemIds: string[],
  organizationId: string,
  branchId: string,
  options: { showroomFallback?: boolean } = {},
): Promise<Map<string, ItemWarehouseLocation>> {
  const map = new Map<string, ItemWarehouseLocation>();
  if (!itemIds.length) return map;

  const storages = await repos.storages.find({
    where: { organizationId, branchId, isActive: true },
  });
  const storageById = new Map(storages.map((s) => [s.id, s]));
  const warehouseIds = storages.filter((s) => !s.isMainStorage).map((s) => s.id);

  const found = await resolveWithinStorages(
    repos,
    itemIds,
    organizationId,
    warehouseIds,
    storageById,
  );

  if (options.showroomFallback) {
    const missing = itemIds.filter((id) => !found.has(id));
    const showroomIds = storages.filter((s) => s.isMainStorage).map((s) => s.id);
    if (missing.length && showroomIds.length) {
      const fallback = await resolveWithinStorages(
        repos,
        missing,
        organizationId,
        showroomIds,
        storageById,
      );
      for (const [itemId, shelves] of fallback) found.set(itemId, shelves);
    }
  }

  for (const itemId of itemIds) {
    map.set(itemId, joinShelves(found.get(itemId)));
  }
  return map;
}

/**
 * Deterministic order (storage code, then location code) so the same data
 * joins into the same string on every load, then the join itself.
 *
 * The two cells are deliberately not symmetric: the code cell carries location
 * codes alone, de-duplicated because two warehouses of one branch may use the
 * same code, while the name cell keeps one "TênKho-TênVịTrí" entry per shelf
 * and is therefore where the warehouse is still named. `Set` preserves
 * insertion order, so the sort above still decides the order.
 */
function joinShelves(shelves: ItemShelf[] | undefined): ItemWarehouseLocation {
  if (!shelves?.length) return { code: null, name: null };
  const sorted = [...shelves].sort((a, b) => {
    const byStorage = (a.storageCode ?? '').localeCompare(b.storageCode ?? '');
    return byStorage || a.locationCode.localeCompare(b.locationCode);
  });
  return {
    code: [...new Set(sorted.map((s) => s.locationCode))].join(', '),
    name: sorted.map((s) => `${s.storageName}-${s.locationName}`).join(', '),
  };
}

/**
 * The resolution itself, over one set of storages — run once for the branch's
 * warehouses and, when a fallback is asked for, again over its showroom.
 * Returns every shelf an item sits on within these storages; only items that
 * actually resolved get an entry.
 */
async function resolveWithinStorages(
  repos: ItemWarehouseLocationRepos,
  itemIds: string[],
  organizationId: string,
  warehouseIds: string[],
  storageById: Map<string, StorageEntity>,
): Promise<Map<string, ItemShelf[]>> {
  const found = new Map<string, ItemShelf[]>();
  if (!itemIds.length || !warehouseIds.length) return found;

  // Only shelves still in use can be reported — a location switched off
  // ("Ngừng hoạt động") is not where the goods are.
  const activeLocations = await repos.locations.find({
    where: { storageId: In(warehouseIds), isActive: true },
  });
  const byLocationId = new Map(activeLocations.map((l) => [l.id, l]));

  const pairKey = (itemId: string, locationId: string) => `${itemId}::${locationId}`;
  const pairs = new Map<string, { itemId: string; locationId: string }>();

  const preferred = await repos.itemStorageLocations.find({
    where: { itemId: In(itemIds), storageId: In(warehouseIds), organizationId },
  });
  const preferredPairs: { itemId: string; locationId: string }[] = [];
  for (const p of preferred) {
    if (!byLocationId.has(p.locationId)) continue;
    const key = pairKey(p.itemId, p.locationId);
    if (pairs.has(key)) continue;
    const pair = { itemId: p.itemId, locationId: p.locationId };
    pairs.set(key, pair);
    preferredPairs.push(pair);
  }

  // The preferred-shelf mapping has no isTracked flag of its own — cross-check
  // its (item, location) pairs against StockBalanceEntity and drop any pair
  // explicitly marked "Ngừng theo dõi". The stocked-shelf query below already
  // filters `isTracked = true` in SQL, so this only matters for pairs sourced
  // from item_storage_locations.
  //
  // Queried as two IN lists and paired up in memory rather than as one OR
  // branch per pair: the OR form costs 4 bind parameters per pair and blows
  // past Postgres' 65535-parameter limit — a hard failure, not a slowdown —
  // once a branch has ~16k shelved items.
  if (preferredPairs.length) {
    const untracked = await repos.stockBalances.find({
      where: {
        organizationId,
        isTracked: false,
        itemId: In([...new Set(preferredPairs.map((p) => p.itemId))]),
        locationId: In([...new Set(preferredPairs.map((p) => p.locationId))]),
      },
    });
    for (const u of untracked) pairs.delete(pairKey(u.itemId, u.locationId));
  }

  const balances = await repos.stockBalances
    .createQueryBuilder('sb')
    .innerJoin(LocationEntity, 'loc', 'loc.id = sb.locationId')
    .where('sb.itemId IN (:...itemIds)', { itemIds })
    .andWhere('sb.organizationId = :orgId', { orgId: organizationId })
    .andWhere('sb.quantity > 0')
    .andWhere('sb.isTracked = true')
    .andWhere('loc.isActive = true')
    .andWhere('loc.storageId IN (:...warehouseIds)', { warehouseIds })
    .select('sb.itemId', 'itemId')
    .addSelect('sb.locationId', 'locationId')
    .getRawMany<{ itemId: string; locationId: string }>();
  for (const b of balances) {
    const key = pairKey(b.itemId, b.locationId);
    if (!pairs.has(key)) pairs.set(key, { itemId: b.itemId, locationId: b.locationId });
  }

  for (const { itemId, locationId } of pairs.values()) {
    const loc = byLocationId.get(locationId);
    if (!loc) continue;
    const storage = storageById.get(loc.storageId);
    const shelf: ItemShelf = {
      storageCode: storage?.code ?? null,
      storageName: storage?.name ?? '',
      locationCode: loc.code,
      locationName: loc.name,
    };
    const list = found.get(itemId);
    if (list) list.push(shelf);
    else found.set(itemId, [shelf]);
  }

  return found;
}
