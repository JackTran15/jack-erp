# TKT-FIX-04 TypeScript any casts + TreeSelectInput entityKey reset

## Epic

[EPIC-29052026-FIX Code Review Fixes](../epics/EPIC-29052026-supplier-review-fixes.md)

## Layer

🟦🟩 Fullstack (type safety only — no runtime behavior change except #3).

## Summary

Three low-priority cleanups:

**Fix A — `qb: any` in service overrides (BE):** `InventoryProviderCrudService.configureListQuery` and `ProviderGroupCrudService.configureListQuery` both declare `qb: any` instead of the typed `SelectQueryBuilder<TEntity>`. This loses all TypeORM query-builder autocomplete and type safety in those methods.

**Fix B — `(err as any).code` fragile cast (BE):** `BaseCrudService` checks `(err as any).code === '23505'` to detect PG unique violations. TypeORM's `QueryFailedError` exposes the driver error code on `err.driverError?.code` (or directly on `err.code` for older pg versions). The current cast works but is fragile and undocumented.

**Fix C — `TreeSelectInput` stale data on `entityKey` change (FE):** If the component is ever reused with a different `entityKey` (e.g. a future relation field pointing to a different entity), `loaded=true` from the previous entity prevents re-fetching. Add a defensive reset `useEffect`.

## Deliverables

**Fix A:**
- `apps/api/src/modules/inventory/location/provider-crud.service.ts` — import `SelectQueryBuilder` from `typeorm`, change `configureListQuery(qb: any, ...)` to `configureListQuery(qb: SelectQueryBuilder<ProviderEntity>, ...)`.
- `apps/api/src/modules/inventory/location/supplier-group-crud.service.ts` — same pattern with `SelectQueryBuilder<SupplierGroupEntity>`.

**Fix B:**
- `apps/api/src/modules/crud/base-crud.service.ts` — both `.catch` blocks (create and update). Replace:
  ```ts
  (err as any).code === '23505'
  ```
  with:
  ```ts
  ((err as QueryFailedError & { code?: string }).code
    ?? (err as any).driverError?.code) === '23505'
  ```

**Fix C:**
- `apps/backoffice-web/src/components/forms/TreeSelectInput.tsx` — add a reset effect before the `loadItems` callback:
  ```ts
  useEffect(() => {
    setLoaded(false);
    setAllItems([]);
    setInputText("");
  }, [entityKey]);
  ```

## Acceptance Criteria

- [ ] `pnpm --filter @erp/api build` passes with no implicit `any` in changed files.
- [ ] `pnpm --filter @erp/backoffice-web build` passes.
- [ ] 409 Conflict response still returned on duplicate `code` create attempt (unique violation detection still works after Fix B).

## Definition of Done

- [ ] PR with all three fixes; TypeScript strict mode passes.

## Tech Approach

- Fix A and B are type-only changes — zero runtime behavior change.
- Fix C adds a reset that fires when `entityKey` changes. In the current app this never happens (each picker instance has a fixed entity), so it's a defensive guard with no observable effect.

## Dependencies

- Requires `SelectQueryBuilder` already imported in `typeorm` (already present in `base-crud.service.ts` — just add to the two service files).
