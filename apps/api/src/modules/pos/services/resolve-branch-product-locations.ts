import { EntityManager, In } from 'typeorm';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { ProductStorageLocationEntity } from '../../inventory/product/product-storage-location.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

/**
 * Resolve each product's preferred location, scoped to the acting branch's
 * storages.
 *
 * A product is org-wide and may carry a ProductStorageLocation row in several
 * branches' storages (the table is keyed UNIQUE(product_id, storage_id)). An
 * unscoped lookup by product_id alone would fold those rows into a map where an
 * arbitrary row wins, so a checkout in one branch could resolve a location that
 * lives inside another branch's storage and deduct stock from the wrong branch.
 *
 * Candidates are therefore restricted to storages owned by `actor.branchId`
 * (keyed off storage -> branch, not the PSL row's own branch_id, so legacy
 * branch_id NULL rows cannot mis-scope). When a product maps to more than one of
 * the branch's storages, the main (showroom) storage wins. Products with no
 * mapping in this branch are omitted, so the caller's checkout guard fails the
 * line closed rather than deducting from elsewhere.
 */
export async function resolveBranchProductLocations(
  manager: EntityManager,
  productIds: string[],
  actor: ActorContext,
): Promise<Map<string, string>> {
  if (productIds.length === 0 || !actor.branchId) return new Map();

  const storages = await manager.findBy(StorageEntity, {
    branchId: actor.branchId,
    organizationId: actor.organizationId,
  });
  if (storages.length === 0) return new Map();

  const mainStorageIds = new Set(
    storages.filter((s) => s.isMainStorage).map((s) => s.id),
  );
  const storageIds = storages.map((s) => s.id);

  const rows = await manager.findBy(ProductStorageLocationEntity, {
    productId: In(productIds),
    storageId: In(storageIds),
    organizationId: actor.organizationId,
  });

  const result = new Map<string, string>();
  for (const row of rows) {
    // First in-branch row wins, but a main-storage row always overrides a
    // non-main one so the showroom shelf is the deterministic default.
    if (!result.has(row.productId) || mainStorageIds.has(row.storageId)) {
      result.set(row.productId, row.locationId);
    }
  }
  return result;
}
