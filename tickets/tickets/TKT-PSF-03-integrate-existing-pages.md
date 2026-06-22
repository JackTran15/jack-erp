# TKT-PSF-03 Single-fill cho 3 trang đã có dialog (Nhập/Xuất/Chuyển kho)

## Epic

[EPIC-21062026 Thay modal "Chọn hàng hóa" cũ bằng ProductSelectDialog (single-fill)](../epics/EPIC-21062026-product-picker-single-fill.md)

## Summary

Trên 3 trang đã nhúng `ProductSelectDialog` (multi): nút full-search của ô SKU mỗi dòng mở `ProductSelectDialog` ở **single mode** điền **đúng dòng đang sửa**, thay cho modal cũ. Giữ nguyên nút "Chọn nhiều hàng hoá" (multi) đang có.

## Deliverables

- `apps/backoffice-web/src/pages/purchase-orders/PurchaseOrdersPage.tsx`
- `apps/backoffice-web/src/pages/goods-issue/GoodsIssuePage.tsx`
- `apps/backoffice-web/src/pages/stock-transfer/StockTransferPage.tsx`

Mỗi trang:
- Thêm state `singlePickerOpen` + `pickerTargetIdx`.
- `LookupField`: bỏ `enableSearchModal`/`searchModalTitle`/`searchModalPlaceholder`; thêm `onOpenSearchModal={() => { setPickerTargetIdx(idx); setSinglePickerOpen(true); }}`.
- Render thêm 1 `ProductSelectDialog selectionMode="single"`; `onConfirm` lấy `lines[0]` → điền dòng `pickerTargetIdx` (tái dùng đúng logic map của `onSelect` cũ).
- Giữ nguyên `productPickerOpen` (multi) + `addLinesFromPicker`.

## Acceptance Criteria

- [ ] Bấm search trên dòng i → dialog single mở; chọn 1 hàng/variant → **chỉ dòng i** được điền (SKU, tên, ĐVT, đơn giá mặc định, kho/vị trí autofill như cơ chế hiện hành của trang).
- [ ] Không tạo dòng mới, không sửa dòng khác.
- [ ] Modal "Chọn hàng hóa" cũ **không còn xuất hiện** ở bất kỳ dòng nào trên 3 trang.
- [ ] Nút "Chọn nhiều hàng hoá" (multi) vẫn thêm nhiều dòng như cũ.
- [ ] Gõ lại mã ở ô → clear `itemId` cũ (giữ cơ chế `onValueChange` hiện có).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Chỉ chạm 3 file trang nêu trên; không đổi backend/api-client.
- [ ] Kiểm tay: chụp before/after mỗi trang (modal cũ → dialog mới).

## Tech Approach

```tsx
const [singlePickerOpen, setSinglePickerOpen] = useState(false);
const [pickerTargetIdx, setPickerTargetIdx] = useState<number | null>(null);

// trong renderEditor của cột "Mã SKU":
<LookupField
  // ...giữ value/onValueChange/onSelect/onCreateNew/portalToBody/dropdownMinWidth...
  onOpenSearchModal={() => { setPickerTargetIdx(idx); setSinglePickerOpen(true); }}
/>

// dialog single-fill (đặt cạnh productPickerOpen multi đang có):
{singlePickerOpen && (
  <ProductSelectDialog
    open
    selectionMode="single"
    showQuantityPrice={false}
    defaultUnitPriceSource="purchasePrice"
    onOpenChange={setSinglePickerOpen}
    onConfirm={(r) => {
      const line = r.lines[0];
      if (line != null && pickerTargetIdx != null) fillLineAt(pickerTargetIdx, line);
      setSinglePickerOpen(false);
    }}
  />
)}
```

- `fillLineAt(idx, line)` tái dùng nguyên logic trong `onSelect` cũ của từng trang (PO có autofill kho/vị trí từ dòng trên + `markDirty`). Trích thành helper để dùng chung cho cả typeahead `onSelect` lẫn dialog.

## Testing Strategy

- Build + kiểm tay 3 trang (single-fill + multi vẫn chạy).

## Dependencies

- Depends on: TKT-PSF-01, TKT-PSF-02
- Blocks: TKT-PSF-05
