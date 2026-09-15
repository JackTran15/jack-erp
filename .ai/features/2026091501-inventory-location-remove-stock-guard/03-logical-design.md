---
feature: inventory-location-remove-stock-guard
adr_count: 1
---

# Logical design — Inventory Location Remove Stock Guard

## Approach

`InventoryLocationStockService.removeItemFromLocation` already throws `ForbiddenException`
when the balance is negative; extend the same branch so quantity > 0 is rejected the same
way, instead of moving the stock to "Chưa xếp" via `StockTransferService.postIntraWarehouseMoves`
and then deleting the row. Only quantity === 0 falls through to the existing delete +
`clearLocation` path. The `ApiOperation` summary on the controller route is updated to match.

On the frontend, `LocationStockItemsDialog`'s trash button gets `disabled={qty > 0}` (qty
already computed the same way the quantity column displays it) and its `title` attribute
becomes conditional: the existing static tooltip text when removable, an explanatory
message when blocked. No new component is introduced — this file already uses the native
`title` attribute as its tooltip mechanism (see the "Xem danh sách hàng hóa..." buttons in
the parent page), so the fix matches the file's existing pattern rather than importing
`@erp/ui`'s Radix `Tooltip`.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Keep the auto-transfer-then-delete behavior, add a confirmation dialog first | Doesn't remove the underlying problem: an immutable, un-reversible CK document is still created as a side effect of what reads as a housekeeping action; confirmation dialogs get clicked through |
| Guard only on the backend, leave the icon clickable | Every located item with stock would let the user click, wait, then hit a toast error — worse UX, and the request explicitly asks for both |
| Guard only in the frontend | The DELETE endpoint is a plain authenticated REST route; any other caller (or a stale frontend build) still triggers the old silent-transfer bug, so the backend must enforce it independently |

## Contracts

### DELETE /inventory/locations/:locationId/stock-items/:itemId
No request/response shape change (still 204 on success). New failure mode only:
Failure modes: 403 → item still has non-zero stock at this location (message names the
required action); unchanged 404s for missing location/item.

## Error taxonomy

| Condition | Failure subtype | UI |
| --- | --- | --- |
| Remove attempted with quantity > 0 | `ForbiddenException`, Vietnamese message | Icon disabled + tooltip before the request is even sent; if called directly, existing toast via `getUserFacingApiErrorMessage` |
| Remove attempted with quantity < 0 | `ForbiddenException` (unchanged) | Same as today |
| Remove attempted with quantity = 0 | none — proceeds | Success toast after "Lưu", as today |

## ADRs

### ADR-01 — Reject non-zero-stock removal instead of auto-transferring
**Context:** The endpoint currently auto-creates a `POSTED` stock transfer to relocate
positive stock to "Chưa xếp" before deleting the shelf's balance row. This undisclosed side
effect produces immutable inventory documents from what reads as a housekeeping action, and
was traced as the source of unintended CK documents.
**Decision:** Refuse the operation whenever quantity ≠ 0 and require staff to move stock
elsewhere first through an explicit transfer/arrange action; this endpoint never creates a
transfer implicitly.
**Consequences:** Removing a located item with stock now takes two explicit steps (move,
then remove) instead of one implicit one. The `postIntraWarehouseMoves` call and its
"Chưa xếp" resolution are dropped from `removeItemFromLocation` (the same helpers remain in
use by `arrange`, which is unaffected).
**Status:** accepted
