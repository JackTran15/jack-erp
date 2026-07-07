# TKT-EXL-01 Fix exchange new-line location to showroom

## Epic

[EPIC-05072026 Inventory & report corrections](../epics/EPIC-05072026-inventory-report-corrections.md)

## Summary

An exchange's **new** lines ("Mua thêm") deduct stock from the storage warehouse instead of the
showroom. `buildNewLineEntities` resolves item locations **without** `{ showroomOnly: true }` and
uses `line.locationId ?? resolved` — so the FE-supplied shelf (`variant.locations[0].locationId`,
often a warehouse) wins. Every correct sale/return path uses `resolved ?? line.locationId` with
`{ showroomOnly: true }`. Align this one path.

## Deliverables

- `apps/api/src/modules/pos/services/create-exchange-invoice.service.ts` (`buildNewLineEntities`):
  - Pass `{ showroomOnly: true }` to `resolveBranchItemLocations(...)`.
  - Flip precedence to `itemLocationMap.get(line.itemId) ?? line.locationId`.
- `apps/api/src/modules/pos/services/resolve-branch-item-locations.ts` — remove the stray
  `console.log("s", storages)` debug line.

## Acceptance Criteria

- [x] An exchange new line whose `line.locationId` is a warehouse shelf produces an
  `InvoiceItemEntity.locationId` equal to the showroom's `is_default` location.
- [x] Exchange return lines (IN) and the SALE/RETURN paths are unchanged (they already resolve
  to the showroom).
- [x] The `SALE_ISSUE` movement at checkout-return posts against the showroom location.

## Definition of Done

- [x] `pnpm --filter @erp/api test` + `lint` green with a new/updated unit test.
- [x] No debug logging left in `resolve-branch-item-locations.ts`.
- [x] No schema or endpoint change.

## Tech Approach

```ts
const itemLocationMap = await resolveBranchItemLocations(manager, itemIds, actor, { showroomOnly: true });
// …
const resolvedLocationId = itemLocationMap.get(line.itemId) ?? line.locationId;
```

## Testing Strategy

- Unit: seed a branch showroom (main storage + `is_default` location) and a warehouse storage;
  build an exchange with a new line carrying the warehouse `locationId`; assert the entity's
  `locationId` is the showroom default. Mirror the existing return-invoice service spec setup.

## Dependencies

- Standalone. Reuses `resolveBranchItemLocations` and the showroom/PSL location model.
