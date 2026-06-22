# TKT-TWF-03 FE: combined Chọn kho dialog + apply-to-all + fill locations

## Epic

[EPIC-21062026 Chuyển kho — chọn kho + auto-fill](../epics/EPIC-21062026-transfer-warehouse-fill.md)

## Summary

Replace the single-warehouse "+ Chọn kho" helper on `StockTransferPage` with a combined dialog that picks **Kho xuất + Kho nhập**. On Đồng ý, set every line's source + dest storage (overwrite) and auto-fill both Vị trí for lines that have an item, via `getTransferPreferredShelfBatch`.

## Deliverables

- `apps/backoffice-web/src/components/document/ChooseTransferWarehousesDialog.tsx` (new) — dialog with two warehouse selects (Kho xuất *, Kho nhập *), Đồng ý / Hủy bỏ; `onConfirm({ source: WarehouseOption, dest: WarehouseOption })`. Model on `ChooseWarehouseDialog` (leave that one untouched — other pages use it).
- `apps/backoffice-web/src/pages/stock-transfer/StockTransferPage.tsx`:
  - The "+ Chọn kho" detail action opens `ChooseTransferWarehousesDialog`.
  - On confirm: `setLines` → every line gets `sourceStorageId/Label` + `destStorageId/Label`; then call `fillTransferLocations(lines)`.
  - `fillTransferLocations(lines)`: build pairs from lines with `itemId` (+ both storages), call `getTransferPreferredShelfBatch`, map `sourceShelf → sourceLocationId/Label`, `destShelf → destLocationId/Label`. Reusable (TWF-04 calls it for a single new line).

## Acceptance Criteria

- [ ] "+ Chọn kho" opens a dialog with both Kho xuất + Kho nhập; both required before Đồng ý.
- [ ] Đồng ý sets source+dest storage on **all** lines (overwriting existing) and fills both Vị trí for lines with an item; lines without an item get storages only.
- [ ] Saving the transfer still sends per-line `sourceStorageId`/`destinationStorageId` + `source/destinationLocationId` unchanged.
- [ ] `ChooseWarehouseDialog` and its other consumers are untouched.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` passes.
- [ ] Manual: open Chuyển kho, add a couple items, "+ Chọn kho" → both warehouses + both Vị trí fill; save round-trips.

## Tech Approach

```tsx
const fillTransferLocations = useCallback(async (lines: FormLine[]) => {
  const pairs = lines
    .filter((l) => l.itemId && l.sourceStorageId && l.destStorageId)
    .map((l) => ({ itemId: l.itemId, sourceStorageId: l.sourceStorageId, destStorageId: l.destStorageId }));
  if (!pairs.length) return;
  const rows = await getTransferPreferredShelfBatch(pairs);
  const byItem = new Map(rows.map((r) => [`${r.itemId}:${r.sourceStorageId}:${r.destStorageId}`, r]));
  setLines((cur) => cur.map((l) => {
    const r = byItem.get(`${l.itemId}:${l.sourceStorageId}:${l.destStorageId}`);
    if (!r) return l;
    return {
      ...l,
      sourceLocationId: r.sourceShelf?.id ?? l.sourceLocationId,
      sourceLocationLabel: r.sourceShelf?.code ?? l.sourceLocationLabel,
      destLocationId: r.destShelf?.id ?? l.destLocationId,
      destLocationLabel: r.destShelf?.code ?? l.destLocationLabel,
    };
  }));
}, []);
```

## Dependencies

- Depends on: TKT-TWF-02 (client).
- Blocks: TKT-TWF-04 (reuses `fillTransferLocations`).
