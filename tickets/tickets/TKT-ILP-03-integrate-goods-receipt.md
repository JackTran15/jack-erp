# TKT-ILP-03 Tích hợp ProductSelectDialog vào Nhập kho (PurchaseOrdersPage)

## Epic

[EPIC-19062026 Dialog chọn hàng + gỡ trang v2](../epics/EPIC-19062026-inventory-line-product-picker.md)

## Summary

Trên trang v1 **Nhập kho** (`PurchaseOrdersPage.tsx`, route `/inventory/purchase-orders`), thêm **icon search trên từng dòng** CHI TIẾT để mở `ProductSelectDialog` (multi-select, có Số lượng/Đơn giá + Nhập nhanh). Chọn N hàng → thêm N dòng (dedupe theo `itemId`), điền Số lượng/Đơn giá đã nhập, Đơn giá mặc định = `purchasePrice`. Vẫn giữ gõ inline `LookupField` + nút "+" tạo nhanh. "Chọn kho" điền kho cho dòng + autofill vị trí như hiện hành.

## Deliverables

- `apps/backoffice-web/src/pages/purchase-orders/PurchaseOrdersPage.tsx`:
  - Cột **Mã SKU** (`lineColumns`): thêm icon search mở `ProductSelectDialog` (cạnh inline lookup + nút "+").
  - Handler `addLinesFromPicker(selected: SelectedLine[])`: map → `FormLine[]`, dedupe theo `itemId`, append; set `orderedQuantity`/`unitPrice` từ dialog; điền `storageId`/`storageLabel` từ "Chọn kho"/kho mặc định; gọi `fillPreferredShelf`/`autoFillAssignedLocation`; `ensureTrailingBlankLine`.
  - Mở `ProductSelectDialog` với `showQuantityPrice defaultUnitPriceSource="purchasePrice"`.

## Acceptance Criteria

- [ ] Click icon search ở 1 dòng → mở dialog; chọn nhiều → thêm đúng số dòng với Số lượng/Đơn giá đã nhập.
- [ ] Dedupe theo `itemId`: chọn lại hàng đã có không tạo dòng trùng (cộng/giữ theo quy ước hiện tại; mặc định bỏ qua trùng).
- [ ] "Nhập nhanh" trong dialog áp Số lượng/Đơn giá cho mọi hàng đã chọn trước khi thêm.
- [ ] Đơn giá prefill = `purchasePrice`; sửa được trong dialog và trong bảng dòng.
- [ ] "Chọn kho" điền `storageId` cho các dòng mới; Vị trí autofill theo cơ chế hiện tại; gõ inline + "+" tạo nhanh vẫn hoạt động.
- [ ] Lưu/post vẫn dùng endpoint hiện tại (`POST /goods-receipts`, `PATCH /goods-receipts/:id`).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Verify thủ công: thêm nhiều dòng qua dialog → Nhập nhanh → Chọn kho điền kho → lưu + nhập kho thành công; ledger ghi đúng.
- [ ] Không phá luồng "Điều chuyển từ cửa hàng khác", import Excel, tạo nhanh NCC/hàng/vị trí.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
function addLinesFromPicker(selected: SelectedLine[]) {
  setLines((prev) => {
    const existing = new Set(prev.map((l) => l.itemId).filter(Boolean));
    const fresh = selected
      .filter((s) => !existing.has(s.itemId))
      .map<FormLine>((s) => ({
        itemId: s.itemId, itemLabel: s.sku, itemName: s.name, unit: s.unit,
        storageId: defaultStorageId, storageLabel: defaultStorageLabel,
        locationId: "", locationLabel: "",
        orderedQuantity: s.quantity, unitPrice: s.unitPrice, notes: "",
      }));
    return ensureTrailingBlankLine([...getPersistableLines(prev), ...fresh]);
  });
  // sau đó: fillPreferredShelf / autoFillAssignedLocation cho dòng mới
}
```

## Testing Strategy

- Verify thủ công (không unit test FE).

## Dependencies

- Depends on: TKT-ILP-02
- Blocks: TKT-ILP-06
