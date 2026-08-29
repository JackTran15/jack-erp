import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { ReportStoreScope } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../branch/branch.entity';
import { ItemCategoryEntity } from '../../inventory/location/item-category.entity';
import { LocationEntity } from '../../inventory/location/location.entity';

/**
 * Impossible branch id — makes an empty permission set an empty result
 * instead of an accidental org-wide query (engines treat [] as "no filter").
 */
const NO_ACCESS_BRANCH_IDS = ['00000000-0000-0000-0000-000000000000'];

/** Branches the actor manages (`user_branch_assignments` baked into the JWT). */
export function permittedBranchIds(actor: ActorContext): Set<string> {
  return new Set(actor.branchIds ?? []);
}

/**
 * Resolve the branch scope of an inventory report search, always clamped to
 * the branches the actor manages (`actor.branchIds`):
 * - `scope: "all"` or absent ⇒ every permitted branch (empty permission set
 *   ⇒ no data, never org-wide).
 * - `scope: "group"` ⇒ the listed storeIds; a store outside the permitted set
 *   is a 403, an id outside the organization is a 400.
 */
export async function resolveInventoryBranchIds(
  branches: Repository<BranchEntity>,
  store: ReportStoreScope | undefined,
  actor: ActorContext,
): Promise<string[] | undefined> {
  const permitted = permittedBranchIds(actor);

  if (!store || store.scope === 'all' || !store.storeIds?.length) {
    return permitted.size ? [...permitted] : NO_ACCESS_BRANCH_IDS;
  }

  const ids = [...new Set(store.storeIds)];
  const denied = ids.filter((id) => !permitted.has(id));
  if (denied.length) {
    throw new ForbiddenException(
      `Access denied for stores: ${denied.join(', ')}`,
    );
  }
  // Defense in depth — permitted ids come from same-org assignments already.
  const owned = await branches.find({
    where: { id: In(ids), organizationId: actor.organizationId },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    const ownedIds = new Set(owned.map((b) => b.id));
    const foreign = ids.filter((id) => !ownedIds.has(id));
    throw new BadRequestException(
      `Unknown store ids: ${foreign.join(', ')}`,
    );
  }
  return ids;
}

/**
 * Resolve storage (warehouse) ids into their location ids — the stock-period
 * engine filters by `location_id`, while the FE "Kho" filter selects storages.
 * Returns undefined when no warehouse filter is set.
 */
export async function resolveWarehouseLocationIds(
  locations: Repository<LocationEntity>,
  warehouseIds: string[] | undefined,
  organizationId: string,
): Promise<string[] | undefined> {
  if (!warehouseIds?.length) return undefined;
  const rows = await locations.find({
    where: { storageId: In([...new Set(warehouseIds)]), organizationId },
    select: { id: true },
  });
  // No locations under the selected storages ⇒ impossible filter, not "no filter".
  if (!rows.length) return ['00000000-0000-0000-0000-000000000000'];
  return rows.map((l) => l.id);
}

/**
 * Resolve a product group filter into that group plus every group beneath it.
 *
 * Items are only ever tagged to a leaf group, while the picker (`TreeSelectInput`)
 * offers every node — so matching the selected id alone returns nothing at all for
 * any parent. Walking the whole subtree is what the POS catalogue filter already
 * does for the same reason (`PosCatalogProductService.resolveDescendantCategoryIds`).
 *
 * Returns undefined when no group filter is set. A group outside the organization
 * yields the impossible id rather than undefined, so an unknown filter means an
 * empty result instead of an accidental unfiltered one.
 */
export async function resolveDescendantCategoryIds(
  categories: Repository<ItemCategoryEntity>,
  categoryId: string | undefined,
  organizationId: string,
): Promise<string[] | undefined> {
  if (!categoryId) return undefined;

  const rows = await categories.find({
    where: { organizationId },
    select: { id: true, parentGroupId: true },
  });

  const childrenByParent = new Map<string, string[]>();
  const known = new Set<string>();
  for (const row of rows) {
    known.add(row.id);
    if (!row.parentGroupId) continue;
    const siblings = childrenByParent.get(row.parentGroupId);
    if (siblings) siblings.push(row.id);
    else childrenByParent.set(row.parentGroupId, [row.id]);
  }

  // Unknown group ⇒ impossible filter, matching resolveWarehouseLocationIds.
  if (!known.has(categoryId)) return ['00000000-0000-0000-0000-000000000000'];

  // `visited` is not belt-and-braces: a malformed tree with a cycle would
  // otherwise walk forever, and the legacy CTE guards the same case with UNION.
  const visited = new Set<string>([categoryId]);
  const queue = [categoryId];
  while (queue.length) {
    for (const child of childrenByParent.get(queue.pop()!) ?? []) {
      if (visited.has(child)) continue;
      visited.add(child);
      queue.push(child);
    }
  }
  return [...visited];
}
