# TKT-TWF-04 FE: auto-add line on item select (transfer grid)

## Epic

[EPIC-21062026 Chuyển kho — chọn kho + auto-fill](../epics/EPIC-21062026-transfer-warehouse-fill.md)

## Summary

On the Chuyển kho line grid, selecting an item on the **last** row appends a new empty row so the user can keep adding items without clicking "+ Thêm dòng". If the line already has both warehouses, also auto-fill its Vị trí (reusing `fillTransferLocations` from TWF-03). Chuyển kho only.

## Deliverables

- `apps/backoffice-web/src/pages/stock-transfer/StockTransferPage.tsx`:
  - In the SKU `LookupField` `onSelect` (`fillLineFromItem(idx, item)`): after populating the line, if `idx` is the last row, append a fresh `makeEmptyLine()` (carry over the chosen source/dest storage so the new row keeps them).
  - After filling the item, call `fillTransferLocations` for that line (if it has both storages) so its Vị trí fills immediately.
  - Guard against duplicate appends (only append when selecting on the current last row and it had no item before).

## Acceptance Criteria

- [ ] Selecting an item on the last row appends exactly one new empty row; the new row inherits the current source/dest storage.
- [ ] Selecting an item on a non-last row does not append.
- [ ] If the line has both warehouses, its Vị trí auto-fills on item select.
- [ ] "+ Thêm dòng" still works; no duplicate/blank-row buildup.
- [ ] Nhập kho / Xuất kho grids unchanged.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` passes.
- [ ] Manual: on Chuyển kho, pick items consecutively without clicking "+ Thêm dòng"; rows append and Vị trí fills.

## Tech Approach

```tsx
const fillLineFromItem = (idx: number, item: ItemOption) => {
  setLines((prev) => {
    const next = prev.map((l, i) => (i === idx ? { ...l, itemId: item.id, itemLabel: item.code, itemName: item.name, unit: item.unit } : l));
    const isLast = idx === prev.length - 1;
    const wasEmpty = !prev[idx]?.itemId;
    if (isLast && wasEmpty) {
      const src = next[idx];
      next.push({ ...makeEmptyLine(), sourceStorageId: src.sourceStorageId, sourceStorageLabel: src.sourceStorageLabel, destStorageId: src.destStorageId, destStorageLabel: src.destStorageLabel });
    }
    return normalizeLines(next);
  });
  markDirty();
  void fillTransferLocations([/* the just-filled line */]);
};
```

## Dependencies

- Depends on: TKT-TWF-03 (`fillTransferLocations`, dialog wiring).
- Blocks: none.
