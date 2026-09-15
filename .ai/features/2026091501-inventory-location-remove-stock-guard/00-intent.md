---
feature: inventory-location-remove-stock-guard
slug: 2026091501-inventory-location-remove-stock-guard
owner: Akenzy
created: 2026-09-15
status: draft
---

# Intent — Inventory Location Remove Stock Guard

## Problem

"Bỏ hàng hóa khỏi vị trí" (remove item from location, in "Vị trí hàng hóa") currently
accepts an item that still has positive stock: `InventoryLocationStockService.removeItemFromLocation`
silently moves the stock to the storage's virtual "Chưa xếp" location via an
auto-generated, immediately-`POSTED` Chuyển kho (CK) transfer, then deletes the shelf's
balance row. The user clicking the trash icon gets no signal that this creates a real,
immutable inventory document — it consumes a document number and cannot be edited or
reversed from the Chuyển kho screen. This was identified as the source of unexplained
system-generated CK documents (see the CK009211 investigation, 2026-09-14).

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Warehouse staff (Nhân viên kho) | Can remove an item with positive stock from a shelf; a phantom CK transfer is created silently | Cannot remove an item while it still has stock; the remove icon is disabled with an explanatory tooltip, and the same rule is enforced by the API |

## Success signal

Removing an item with quantity > 0 from a location is impossible from both surfaces:
- Backoffice: the trash icon in "Vị trí hàng hóa" is disabled and shows a tooltip on hover.
- API: `DELETE /inventory/locations/:locationId/stock-items/:itemId` rejects with a 4xx
  and creates no stock transfer and no balance change when quantity > 0.

Removing an item with quantity = 0 is unaffected (unchanged behavior).

## Out of scope

- The "Xếp vị trí hàng hóa" (arrange) and "Chuyển vị trí hàng hóa" (change location) flows — unaffected, no other flow is being touched.
- Reversing or cleaning up CK documents already created by the old behavior.
- Any new UI affordance to move stock out of a location before removing it — staff use the existing Chuyển vị trí / Chuyển kho screens first.

## Constraints

| Kind | Detail |
| --- | --- |
| Compatibility | Removing a zero-stock item must keep working exactly as it does today (balance row deleted, preferred-shelf mapping cleared) |
| Style | Reuse the existing `ForbiddenException` guard already in this method for negative stock, rather than introducing a new error shape |

## Existing surface touched

- Reused components: `LocationStockItemsDialog.tsx` (trash icon column), `InventoryLocationStockService.removeItemFromLocation`
- Adjacent code: `StockTransferService.postIntraWarehouseMoves` — no longer invoked from this path (still used by `arrange`)
- Entry points: no new route; existing `DELETE /inventory/locations/:locationId/stock-items/:itemId`
