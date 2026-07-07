import { EntityManager, In } from 'typeorm';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { LocationEntity } from '../../inventory/location/location.entity';
import { ItemStorageLocationEntity } from '../../inventory/product/item-storage-location.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

/**
 * Resolve each item's (variant's) preferred location, scoped to the acting
 * branch's storages.
 *
 * An item is org-wide and may carry an ItemStorageLocation row in several
 * branches' storages (the table is keyed UNIQUE(item_id, storage_id)). An
 * unscoped lookup by item_id alone would fold those rows into a map where an
 * arbitrary row wins, so a checkout in one branch could resolve a location that
 * lives inside another branch's storage and deduct stock from the wrong branch.
 *
 * Candidates are therefore restricted to storages owned by `actor.branchId`
 * (keyed off storage -> branch, not the row's own branch_id, so legacy
 * branch_id NULL rows cannot mis-scope). When an item maps to more than one of
 * the branch's storages, the main (showroom) storage wins.
 *
 * Items with no row in this branch fall back to the showroom (main) storage's
 * dedicated "Mặc định" (is_default) location, so any POS-visible item is
 * sellable without manual shelf assignment. An explicit row always overrides
 * this fallback. If the showroom has no default location (or the branch has no
 * main storage), the item is omitted and the caller's checkout guard fails the
 * line closed rather than deducting from elsewhere.
 *
 * With `showroomOnly`, warehouse (non-main) shelf rows are ignored entirely, so
 * a POS movement never resolves a warehouse location: an item shelved only in a
 * warehouse falls through to the showroom's default location (or is omitted when
 * none exists). Used by every POS deduction path (sale, return, and both
 * exchange legs) so stock always leaves the showroom.
 */
export async function resolveBranchItemLocations(
  manager: EntityManager,
  itemIds: string[],
  actor: ActorContext,
  options: { showroomOnly?: boolean } = {},
): Promise<Map<string, string>> {
  if (itemIds.length === 0 || !actor.branchId) return new Map();

  const storages = await manager.findBy(StorageEntity, {
    branchId: actor.branchId,
    organizationId: actor.organizationId,
  });
  if (storages.length === 0) return new Map();

  const mainStorageIds = new Set(
    storages.filter((s) => s.isMainStorage).map((s) => s.id),
  );
  const storageIds = Array.from(mainStorageIds);

  const rows = await manager.findBy(ItemStorageLocationEntity, {
    itemId: In(itemIds),
    storageId: In(storageIds),
    organizationId: actor.organizationId,
  });

  // For POS sales, drop warehouse rows so only showroom shelves can win; the
  // showroom-default fallback below then covers warehouse-only items.
  const candidateRows = options.showroomOnly
    ? rows.filter((row) => mainStorageIds.has(row.storageId))
    : rows;

  const result = new Map<string, string>();
  for (const row of candidateRows) {
    // First in-branch row wins, but a main-storage row always overrides a
    // non-main one so the showroom shelf is the deterministic default.
    if (!result.has(row.itemId) || mainStorageIds.has(row.storageId)) {
      result.set(row.itemId, row.locationId);
    }
  }

  // Fall back to the showroom's "Mặc định" location for items with no explicit
  // shelf, so a freshly created POS-visible item still sells.
  const mainStorage = storages.find((s) => s.isMainStorage);
  if (mainStorage) {
    const defaultLocation = await manager.findOne(LocationEntity, {
      where: {
        storageId: mainStorage.id,
        isDefault: true,
        organizationId: actor.organizationId,
      },
    });
    if (defaultLocation) {
      for (const itemId of itemIds) {
        if (!result.has(itemId)) {
          result.set(itemId, defaultLocation.id);
        }
      }
    }
  }

  return result;
}
