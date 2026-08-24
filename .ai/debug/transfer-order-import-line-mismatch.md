# Debug report — `400 Line item is not part of the transfer order` on import

Status: **static analysis, traced to source**. No live DB access (the local
`erp_clone_prod` clone is stale — last row 2026-08-13, 23 total `goods_issues`
rows — and does not contain `XK000275`), so the exact edit that triggered this
instance is not confirmed from data. Every claim below is traced to a line of
source; confirmation query is at the end.

---

## 1. Where the error comes from

`TransferOrderService.buildImportLinesFromInput`
(`apps/api/src/modules/inventory/transfer-order/transfer-order.service.ts:1010-1046`),
called from `confirmImport` (`:1148`), which backs `POST
/inventory/transfer-orders/:id/import`:

```ts
const byItem = new Map(to.lines.map((l) => [l.itemId, l]));
return inputLines.map((l) => {
  const orderLine = byItem.get(l.itemId);
  if (!orderLine) {
    throw new BadRequestException("Line item is not part of the transfer order");
  }
  ...
```

`to.lines` is `TransferOrderEntity.lines` (`transfer_order_lines`, eager
relation — `transfer-order.entity.ts:97-101`), loaded fresh via `findOrFail`
inside `confirmImport`. `inputLines` is whatever the goods-receipt form
submitted.

## 2. What the goods-receipt form actually submits

`GoodsReceiptFormDialog.prefillFromTransferOrder`
(`apps/backoffice-web/src/components/document/GoodsReceiptFormDialog.tsx:623-701`)
does **not** prefill from the transfer order's own lines when an export issue
exists. It prefills from the **export goods issue's** lines instead
(`fromIssueLines`, `:666-680`), fetched via `GET
/inventory/transfer-orders/:id/export-goods-issue`. The comment at `:647-650`
states the intent directly:

> "The order says what was asked for; the export issue says what was actually
> sent, line by line... Once an issue exists it is the one to mirror."

So the receipt grid mirrors `goods_issue_lines`, and `confirmImport` validates
against `transfer_order_lines`. These two are supposed to stay identical. They
can drift.

## 3. How they drift

`GoodsIssueService.update()`
(`apps/api/src/modules/inventory/goods-issue/goods-issue.service.ts:383-618`)
lets a **posted** `TRANSFER_OUT` goods issue be edited with an arbitrary new
`lines` array — no check that every line's `itemId` still belongs to the
linked transfer order (that check only exists in the *create* path,
`buildExportLinesFromInput`, `:970-1003`). The frontend
(`GoodsIssueFormDialog.tsx`) has no line-lock for `TRANSFER_OUT` either — same
free-form grid as any other issue purpose.

When such an edit changes quantities/items, `computeVoucherDelta`
(`voucher-delta.util.ts:115-149`) is correct: a brand-new `(itemId,
locationId)` key that only exists in `after` produces a delta entry
(`b` is `undefined`, `quantityDelta = a.quantity`).

That delta cascades to the transfer order
(`goods-issue.service.ts:605-618` → `TransferOrderService.applyLegRevision`,
`transfer-order.service.ts:1534-1598`). Before the destination has imported
(`!to.importGoodsReceiptId`, the exact state of an order sitting in "Điều
chuyển từ cửa hàng khác"), the export-side branch calls
**`adjustRequestedQty`** (`:1679-1692`):

```ts
private async adjustRequestedQty(orderId, deltas) {
  for (const d of deltas) {
    if (d.quantityDelta === 0) continue;
    await this.dataSource.manager.query(
      `UPDATE transfer_order_lines
         SET requested_qty = GREATEST(requested_qty + $1, 0)
       WHERE transfer_order_id = $2 AND item_id = $3`,
      [d.quantityDelta, orderId, d.itemId],
    );
  }
}
```

**This is the bug.** For an item that was already a line on the transfer
order, the `UPDATE` matches and adjusts it correctly. For an item that is
*new* to the goods issue — added or swapped in during the edit — there is no
existing `transfer_order_lines` row with that `item_id`, so the `UPDATE`
matches zero rows and silently does nothing. No insert, no error, no log.
`transfer_order_lines` is left permanently missing that item.

The goods issue itself is edited successfully and stays POSTED with the new
line — nothing on the source-branch side signals a problem. The order now
disagrees with its own export issue.

## 4. Why it surfaces as this exact error

- Destination opens "Nhập kho" → "Điều chuyển từ cửa hàng khác" → "Chọn chứng
  từ điều chuyển", picks the order.
- `prefillFromTransferOrder` mirrors the **goods issue's** lines (§2) — which
  correctly include the item added by the later edit.
- On Lưu, `POST /inventory/transfer-orders/:id/import` runs
  `buildImportLinesFromInput` against `to.lines` — which is missing that item
  (§3).
- `byItem.get(itemId)` misses → `400 Line item is not part of the transfer
  order`, for the item that was added/changed after the transfer order was
  first created/exported.

This also matches the observed shape: the receipt form shows a normal,
fully-populated 2-line grid (both SKUs resolved, Kho/Vị trí filled) — nothing
looks wrong client-side, because the client is faithfully mirroring the goods
issue. The failure is purely server-side state drift, invisible until the
destination branch tries to import.

A milder version of the same bug exists for **removed** items:
`GREATEST(requested_qty + delta, 0)` floors a fully-removed item's line at 0
instead of deleting it — a stale zero-qty `transfer_order_lines` row survives
(cosmetic today, since 0-qty order lines aren't otherwise checked, but the
same silent-desync class of problem).

## 5. Fix

`adjustRequestedQty` needs to upsert, not blind-update. On a positive delta
for an item with no existing `transfer_order_lines` row, insert one instead of
silently no-op'ing — mirroring what `makeLine` / `fillSourceLocations` do for
lines created at order-creation time (source location has to be resolved the
same way, since a raw `INSERT` can't leave `source_location_id` unset if
downstream code assumes it's populated). Consider also deleting a line whose
quantity lands at 0 rather than leaving a dangling zero row.

Immediate unblock for this specific order: manually insert the missing
`transfer_order_lines` row(s) for the affected item(s) so the two SKUs line up
with what `XK000275` actually carries, then retry the import. Needs the real
order id / item ids from production, not the stale clone.

## 6. How to confirm from real data

```sql
-- Real prod, not the local erp_clone_prod (stale, has no XK000275).
SELECT gi.id, gi.document_number, gi.revision, gi.created_at, gi.updated_at
FROM goods_issues gi WHERE gi.document_number = 'XK000275';

-- Compare the two sides directly:
SELECT gil.item_id, gil.quantity FROM goods_issue_lines gil
WHERE gil.goods_issue_id = '<gi.id above>';

SELECT tol.item_id, tol.requested_qty FROM transfer_order_lines tol
JOIN transfer_orders t ON t.id = tol.transfer_order_id
WHERE t.export_goods_issue_id = '<gi.id above>';
```

`gi.revision > 0` (or `updated_at` well after `created_at`) confirms the issue
was edited post-creation. Any `item_id` present in `goods_issue_lines` but
absent from `transfer_order_lines` is the line the 400 is thrown for.
