# TKT-PMP-02 3 trang: per-row search → multi, gỡ single-fill

## Epic

[EPIC-21062026 ProductSelectDialog: per-row multi + per-group Nhập nhanh](../epics/EPIC-21062026-product-picker-multi-quick-entry.md)

## Summary

`PurchaseOrdersPage`, `GoodsIssuePage`, `StockTransferPage` đã có `ProductSelectDialog` multi + `addLinesFromPicker`. Trỏ nút search ô SKU/dòng (`onSearchButtonClick`) về **dialog multi** (thêm N dòng); gỡ dialog/state single-fill đã thêm ở epic single-fill; gộp nút magnifier "Chọn nhiều" trùng chức năng.

## Deliverables

- 3 file trang. Mỗi trang:
  - `onSearchButtonClick` (LookupField ô SKU) → `setProductPickerOpen(true)` thay vì mở single dialog.
  - Gỡ: `singlePickerOpen`/`pickerTargetIdx` state + block `<ProductSelectDialog selectionMode="single" …>`.
  - Gỡ nút magnifier riêng (`title="Chọn nhiều hàng hoá"`) vì nút search của ô đã mở multi — hoặc giữ nếu muốn (xác nhận ở Step 3). **Đề xuất: gỡ** để 1 entry point.
  - Giữ `fillLineFromItem` (vẫn dùng cho typeahead `onSelect`).

## Acceptance Criteria

- [ ] Bấm search ô SKU → mở `ProductSelectDialog` multi (group/header checkbox, qty/price, Nhập nhanh nhóm + global).
- [ ] "Chọn (N)" thêm đúng N dòng (dedupe `itemId`) như `addLinesFromPicker` hiện hành.
- [ ] Typeahead gõ + chọn 1 (onSelect → `fillLineFromItem`) vẫn điền đúng dòng.
- [ ] Không còn dialog single-fill; không còn 2 nút search trùng chức năng (nếu chọn gỡ magnifier).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Chỉ chạm 3 file trang; không đổi backend.

## Tech Approach

```tsx
// onSearchButtonClick → mở multi
onSearchButtonClick={() => setProductPickerOpen(true)}

// GỠ block single-fill đã thêm ở epic trước:
//   {singlePickerOpen && (<ProductSelectDialog selectionMode="single" …/>)}
//   + state singlePickerOpen / pickerTargetIdx

// GIỮ dialog multi đang có:
{productPickerOpen && (
  <ProductSelectDialog open onOpenChange={setProductPickerOpen}
    showQuantityPrice defaultUnitPriceSource="purchasePrice" /* hoặc "none" theo trang */
    onConfirm={addLinesFromPicker} />
)}
```

> Nếu giữ nút magnifier: nó và nút search ô SKU đều `setProductPickerOpen(true)` — chấp nhận trùng. Khuyến nghị gỡ magnifier.

## Testing Strategy

- Build + kiểm tay 3 trang: search/dòng → multi → thêm N dòng; per-group Nhập nhanh.

## Dependencies

- Depends on: TKT-PMP-01
- Blocks: TKT-PMP-04
