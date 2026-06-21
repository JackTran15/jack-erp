# TKT-PMP-03 2 trang còn lại: thêm dialog multi + addLinesFromPicker

## Epic

[EPIC-21062026 ProductSelectDialog: per-row multi + per-group Nhập nhanh](../epics/EPIC-21062026-product-picker-multi-quick-entry.md)

## Summary

`TransferOrdersPage` và `StockTakeFormDialog` mới chỉ có single-fill (epic trước). Thêm `ProductSelectDialog` **multi** + mapper `addLinesFromPicker` để search/dòng thêm N dòng; gỡ single-fill.

## Deliverables

- `apps/backoffice-web/src/pages/transfer-orders/TransferOrdersPage.tsx`:
  - State `productPickerOpen`; `onSearchButtonClick` → mở multi; gỡ `singlePickerOpen`/single dialog.
  - `addLinesFromPicker(result)`: map `SelectedLine[]` → `FormLine[]` (itemId/itemLabel/itemName/unit), dedupe `itemId`, append qua `normalizeFormLines`. Không có giá/kho phức tạp như PO.
- `apps/backoffice-web/src/pages/stock-takes/StockTakeFormDialog.tsx`:
  - State `productPickerOpen`; `onSearchButtonClick` → mở multi; gỡ `singlePickerOpen`/single dialog.
  - `addItemsFromPicker(result)`: với mỗi `SelectedLine` chưa có trong rows → resolve location/expected như `handlePickItem` (dùng lại `resolveItemDefaults`) rồi thêm row; chạy tuần tự/`Promise.all`, giữ "trailing empty row".
  - `showQuantityPrice={false}` cho StockTake (kiểm kê không nhập đơn giá ở picker) — chỉ cần chọn nhiều mã; số liệu kiểm nhập ở grid. (Xác nhận ở Step 3.)

## Acceptance Criteria

- [ ] TransferOrders: search/dòng → multi → thêm N dòng đúng; dedupe; typeahead vẫn điền 1 dòng.
- [ ] StockTake: search/dòng → multi → thêm N hàng, mỗi hàng resolve đúng location/expectedQty như chọn lẻ; không mất số liệu đã nhập của hàng cũ.
- [ ] Không còn single-fill ở 2 trang.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Chỉ chạm 2 file trang; không đổi backend.

## Tech Approach

```tsx
// TransferOrders
const addLinesFromPicker = (result: ProductSelectResult) => {
  const existing = new Set(lines.map((l) => l.itemId).filter(Boolean));
  const fresh = result.lines.filter((s) => s.itemId && !existing.has(s.itemId)).map((s) => ({
    ...emptyLine(), itemId: s.itemId, itemLabel: s.sku, itemName: s.name, unit: s.unit,
  }));
  if (!fresh.length) return;
  setLines(normalizeFormLines([...getPersistableFormLines(lines), ...fresh]));
  markDirty();
};

// StockTake — batch resolve (reuse resolveItemDefaults như handlePickItem)
const addItemsFromPicker = async (result: ProductSelectResult) => {
  const existing = new Set(rows.map((r) => r.itemId).filter(Boolean));
  const picked = result.lines.filter((s) => s.itemId && !existing.has(s.itemId));
  for (const s of picked) {
    await handlePickItem(
      { id: s.itemId, code: s.sku, name: s.name, unit: s.unit, purchasePrice: s.purchasePrice },
      indexOfNextEmptyRow(),   // hoặc append rồi resolve theo index
    );
  }
};
```

> StockTake: cân nhắc dùng lại trực tiếp `handlePickItem` theo từng item vào "trailing empty row" để không phải viết lại resolve location/expected.

## Testing Strategy

- Build + kiểm tay 2 trang.

## Dependencies

- Depends on: TKT-PMP-01
- Blocks: TKT-PMP-04
