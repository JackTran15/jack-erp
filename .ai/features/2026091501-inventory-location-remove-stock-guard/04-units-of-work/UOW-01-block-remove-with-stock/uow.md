---
id: UOW-01
slug: block-remove-with-stock
title: Removing a located item with stock is blocked, front and back
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03]
risk: low
status: todo
rollback: revert both commits — the endpoint and UI return to the auto-transfer-then-delete behavior
---

# UOW-01 — Removing a located item with stock is blocked, front and back

## Demo script

1. Open "Vị trí hàng hóa" in backoffice-web, click into a shelf that has an item with
   quantity > 0. The trash icon on that row is greyed out; hovering it shows a tooltip
   explaining the item still has stock.
2. Click into a shelf with an item at quantity = 0. The trash icon is enabled; mark it,
   press "Lưu" — the row disappears, no error.
3. `curl -X DELETE` the same in-stock item's endpoint directly (bypassing the UI) → 403
   with a Vietnamese message; confirm via DB that no new `stock_transfers` row and no
   deleted `stock_balances` row were produced.

## In scope

- `InventoryLocationStockService.removeItemFromLocation` rejects quantity ≠ 0 instead of
  moving positive stock to "Chưa xếp" first.
- `LocationStockItemsDialog`'s remove icon is disabled + tooltip when quantity > 0.

## Not in scope

- `arrange` / "Chuyển vị trí hàng hóa" flows.
- Any cleanup of previously created system-generated transfers.

## Risks

| Risk | Mitigation |
| --- | --- |
| A caller depended on the old auto-transfer side effect | Grep confirms `removeItemFromLocation` has exactly one caller (the controller route); no other service invokes it |

## Definition of done

- [ ] AC-01..03 pass
- [ ] Existing zero-stock removal test still passes unchanged
- [ ] Demoed and accepted at gate G4
