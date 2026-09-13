import { In, Repository } from 'typeorm';
import { LocationEntity } from '../../inventory/location/location.entity';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { ItemStorageLocationEntity } from '../../inventory/product/item-storage-location.entity';
import { StockBalanceEntity } from '../../inventory/ledger/stock-balance.entity';

export interface ItemWarehouseLocation {
  code: string | null;
  name: string | null;
  storage: string | null;
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
  /** Not displayed — only the final tie-break in `joinShelves`. */
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
 * skipped. Every matching shelf is joined into three cells: `code` lists the
 * location codes (`"A101, A201"`), `name` lists the location names
 * (`"Kệ A101, Kệ A201"`), and `storage` lists the warehouse names
 * (`"Kho A1, Kho A2"`). The warehouse gets a column of its own rather than a
 * prefix inside the location cells — a location code is only unique within its
 * storage, so the information is needed, but prefixing crowded out the part
 * actually being read. Nothing left → all three empty.
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
 * Deterministic order, then the join itself.
 *
 * Sorted by location code, then location name — the keys the reader can
 * actually see. Storage code is only the final tie-break: two shelves in
 * different warehouses may share both a code and a name, and without it their
 * order would fall back to query order.
 *
 * The three cells are deliberately not symmetric, so their entry counts can
 * differ on the same row. `code` and `storage` de-duplicate: two warehouses of
 * one branch may use the same location code, and one item usually occupies
 * several shelves of the same warehouse — "999, 999" and "Kho A1, Kho A1" say
 * nothing. `name` does not: its entry count is the number of shelves the item
 * actually sits on, which is the point of the column. All three follow the one
 * sort above, so they read in parallel — `Set` preserves insertion order.
 */
function joinShelves(shelves: ItemShelf[] | undefined): ItemWarehouseLocation {
  if (!shelves?.length) return { code: null, name: null, storage: null };
  const sorted = [...shelves].sort(
    (a, b) =>
      a.locationCode.localeCompare(b.locationCode) ||
      a.locationName.localeCompare(b.locationName) ||
      (a.storageCode ?? '').localeCompare(b.storageCode ?? ''),
  );
  return {
    code: [...new Set(sorted.map((s) => s.locationCode))].join(', '),
    name: sorted.map((s) => s.locationName).join(', '),
    storage: [...new Set(sorted.map((s) => s.storageName))].join(', '),
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
