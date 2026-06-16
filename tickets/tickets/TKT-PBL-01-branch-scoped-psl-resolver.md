# TKT-PBL-01 Branch-scoped PSL resolver + rewire both POS resolve sites + regression tests

## Epic

[EPIC-14062026 POS branch-scoped product-location resolver](../epics/EPIC-14062026-pos-branch-scoped-location-resolver.md)

## Summary

Replace the two unscoped `product_storage_locations` (PSL) lookups in POS with a single shared, **branch-scoped** resolver. Today both sites query `manager.findBy(ProductStorageLocationEntity, { productId: In(...) })` and build `new Map(rows.map(r => [r.productId, r.locationId]))` — last-row-wins across *all* branches. The fix restricts candidate PSL rows to storages owned by `actor.branchId`, prefers the branch's `isMainStorage` (showroom) row when a product maps to several, and omits products with no in-branch mapping (so the existing checkout guard fails them closed with 400). Both call sites are inside their service's transaction and already hold an `EntityManager`, so the helper takes `manager` and needs **no module/DI changes**.

## Deliverables

- `apps/api/src/modules/pos/services/resolve-branch-product-locations.ts` (new) — shared helper `resolveBranchProductLocations(manager, productIds, actor): Promise<Map<string,string>>`.
- `apps/api/src/modules/pos/services/invoice.service.ts` — `resolveProductLocations(manager, catalogItems, actor)` delegates to the helper (thread `actor` from the one caller at `createDraft`, ~line 173).
- `apps/api/src/modules/pos/services/create-exchange-invoice.service.ts` — `buildNewLineEntities` replaces its inline `locRows`/`productLocationMap` block (~lines 162-175) with the helper; drop the now-unused `ProductStorageLocationEntity` import if nothing else uses it.
- `apps/api/src/modules/pos/services/resolve-branch-product-locations.spec.ts` (new) — unit tests (cross-branch regression, main-storage preference, fail-closed, empty inputs).

No entity, migration, DTO, controller, event, permission, or FE change.

## Acceptance Criteria

- [ ] PSL candidates are filtered to `storageId IN (storages where branchId = actor.branchId, org = actor.organizationId)` and `organizationId = actor.organizationId`.
- [ ] When a product maps to >1 of the branch's storages, the `isMainStorage` row's `locationId` is chosen; a non-main row never overrides a main one.
- [ ] A product with no PSL row in the branch's storages is **absent** from the returned map (→ `locationId` resolves `undefined` → checkout guard 400). No cross-branch fallback.
- [ ] Empty `productIds` or missing `actor.branchId` → empty map (no throw).
- [ ] Both POS resolve sites produce identical results via the shared helper (no duplicated lookup logic remains).
- [ ] No cross-tenant leakage: every query carries `organizationId`.

## Definition of Done

- [ ] PR passes `pnpm --filter @erp/api test` and `pnpm --filter @erp/api lint`.
- [ ] New spec covers: cross-branch pick regression, main-storage preference, no-mapping omission, empty inputs.
- [ ] No schema change; `synchronize` stays false; no migration added.
- [ ] No `openapi:generate` needed (no endpoint/contract change) — confirm `openapi.snapshot.json` unchanged.
- [ ] No Vietnamese in backend source (errors/comments/Swagger/logs).
- [ ] No TODO/FIXME outside the plan.

## Tech Approach

Shared helper — keys off `storage → branch`, so legacy `PSL.branch_id NULL` rows can't mis-scope:

```ts
// resolve-branch-product-locations.ts
import { EntityManager, In } from 'typeorm';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { ProductStorageLocationEntity } from '../../inventory/product/product-storage-location.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

/**
 * Resolve each product's preferred location, scoped to the acting branch's
 * storages. A product is org-wide and may have a ProductStorageLocation row in
 * several branches' storages; an unscoped lookup would pick an arbitrary one and
 * could deduct stock from another branch. Candidates are therefore restricted to
 * storages owned by actor.branchId; when a product maps to more than one, the
 * main (showroom) storage wins. Products with no in-branch mapping are omitted so
 * the caller's checkout guard fails the line closed.
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

  const mainStorageIds = new Set(storages.filter((s) => s.isMainStorage).map((s) => s.id));
  const storageIds = storages.map((s) => s.id);

  const rows = await manager.findBy(ProductStorageLocationEntity, {
    productId: In(productIds),
    storageId: In(storageIds),
    organizationId: actor.organizationId,
  });

  const result = new Map<string, string>();
  for (const row of rows) {
    // First in-branch row wins, but a main-storage row always overrides a non-main one.
    if (!result.has(row.productId) || mainStorageIds.has(row.storageId)) {
      result.set(row.productId, row.locationId);
    }
  }
  return result;
}
```

`invoice.service.ts`:

```ts
private async resolveProductLocations(
  manager: EntityManager,
  catalogItems: ItemEntity[],
  actor: ActorContext,
): Promise<Map<string, string>> {
  const productIds = [
    ...new Set(catalogItems.map((c) => c.productId).filter((p): p is string => !!p)),
  ];
  return resolveBranchProductLocations(manager, productIds, actor);
}
// caller: await this.resolveProductLocations(manager, catalogItems, actor);
```

`create-exchange-invoice.service.ts` (`buildNewLineEntities` already has `actor` + `productIds`):

```ts
const productLocationMap = await resolveBranchProductLocations(manager, productIds, actor);
```

## Testing Strategy

Unit (`resolve-branch-product-locations.spec.ts`) — fake `EntityManager` whose `findBy` branches on the entity arg (return storages for `StorageEntity`, PSL rows for `ProductStorageLocationEntity`); no DB needed:

1. **Cross-branch regression (core):** product P has PSL rows `(P, storageA → locA)` and `(P, storageB → locB)`; `findBy(StorageEntity)` for `branchId=B` returns only `storageB`. Assert `map.get(P) === locB` (never `locA`).
2. **Main-storage preference:** branch B has `storageB_main (isMainStorage)` + `storageB_back`; P maps to both (`locMain`, `locBack`) in either DB order. Assert `map.get(P) === locMain`.
3. **No in-branch mapping → fail closed:** P maps only in `storageA`; branch B returns `storageB`; PSL query returns `[]`. Assert `map.has(P) === false`.
4. **Empty inputs:** `productIds = []` or `actor.branchId` undefined → empty map, `findBy` not called for PSL.

Optional follow-up (not required for DoD): an e2e asserting the `stock_ledger` `SALE_ISSUE` row's `location_id` belongs to the checkout branch's storage.

## Dependencies

- Depends on: none beyond shipped code (helper consolidates existing logic).
- Blocks: none.
