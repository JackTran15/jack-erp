# TKT-PSF-04 Single-fill cho 2 trang còn lại (Lệnh chuyển/Kiểm kê)

## Epic

[EPIC-21062026 Thay modal "Chọn hàng hóa" cũ bằng ProductSelectDialog (single-fill)](../epics/EPIC-21062026-product-picker-single-fill.md)

## Summary

2 trang này hiện **chỉ** dùng modal cũ (`LookupField enableSearchModal`) cho ô SKU; chưa nhúng `ProductSelectDialog`. Thêm import + dialog single-fill và chuyển nút full-search sang `onOpenSearchModal`. Single-fill only (không thêm nút bulk multi-select — out of scope).

## Deliverables

- `apps/backoffice-web/src/pages/transfer-orders/TransferOrdersPage.tsx`
- `apps/backoffice-web/src/pages/stock-takes/StockTakeFormDialog.tsx`

Mỗi trang:
- `import { ProductSelectDialog } from "../../components/shared/product-select/ProductSelectDialog"` (chỉnh path tương đối đúng theo vị trí file).
- Thêm state `singlePickerOpen` + `pickerTargetIdx`.
- `LookupField`: bỏ `enableSearchModal`/`searchModalTitle`/`searchModalPlaceholder`; thêm `onOpenSearchModal`.
- Render `ProductSelectDialog selectionMode="single"`; `onConfirm` → `lines[0]` → điền dòng đích, tái dùng logic `onSelect` cũ của trang (StockTake map theo `sourceIndexForVisible(idx)` và giữ số liệu kiểm kê đã nhập; TransferOrders dùng `normalizeFormLines`).

## Acceptance Criteria

- [ ] Bấm search trên 1 dòng → dialog single → điền đúng dòng đó.
- [ ] StockTake: dùng đúng `sourceIndexForVisible(idx)`; số liệu kiểm kê người dùng đã nhập **không bị mất** khi chọn lại hàng.
- [ ] TransferOrders: dòng sau khi điền qua `normalizeFormLines` như `onSelect` cũ.
- [ ] Modal "Chọn hàng hóa" cũ không còn xuất hiện trên 2 trang.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Chỉ chạm 2 file trang nêu trên; không đổi backend/api-client.
- [ ] Kiểm tay: before/after mỗi trang.

## Tech Approach

```tsx
import { ProductSelectDialog } from "../../components/shared/product-select/ProductSelectDialog";
// hoặc "../../../components/..." tuỳ độ sâu của StockTakeFormDialog

const [singlePickerOpen, setSinglePickerOpen] = useState(false);
const [pickerTargetIdx, setPickerTargetIdx] = useState<number | null>(null);

<LookupField
  // ...giữ value/onValueChange/onSelect/onCreateNew...
  onOpenSearchModal={() => { setPickerTargetIdx(idx); setSinglePickerOpen(true); }}
/>

{singlePickerOpen && (
  <ProductSelectDialog
    open
    selectionMode="single"
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

## Testing Strategy

- Build + kiểm tay 2 trang.

## Dependencies

- Depends on: TKT-PSF-01, TKT-PSF-02
- Blocks: TKT-PSF-05
