# TKT-PSF-01 ProductSelectDialog: thêm selectionMode "single" + fix default title

## Epic

[EPIC-21062026 Thay modal "Chọn hàng hóa" cũ bằng ProductSelectDialog (single-fill)](../epics/EPIC-21062026-product-picker-single-fill.md)

## Summary

Thêm chế độ **chọn-1** cho `ProductSelectDialog` để dùng làm picker điền 1 dòng (single-fill). Mặc định giữ `"multi"` (không đổi hành vi các trang đang dùng). Tiện thể sửa chuỗi debug ở default `title`.

## Deliverables

- `apps/backoffice-web/src/components/shared/product-select/ProductSelectDialog.tsx`:
  - Thêm prop `selectionMode?: "single" | "multi"` (default `"multi"`).
  - Single mode: chọn 1 item tại một thời điểm (chọn item mới bỏ chọn item cũ); không auto-select-all-variants của 1 mẫu mã; ẩn checkbox "chọn tất cả" cấp mẫu mã.
  - `onConfirm` trả `ProductSelectResult` với `lines` đúng 1 phần tử trong single mode.
  - Sửa default `title = "Chọn hàng hóa222"` → `"Chọn hàng hóa"`.

## Acceptance Criteria

- [ ] `selectionMode` không truyền → hành vi cũ y nguyên (multi, các trang hiện tại không đổi).
- [ ] `selectionMode="single"`: chỉ 1 dòng được chọn; chọn dòng khác tự bỏ dòng trước; bấm "Chọn" gọi `onConfirm` với `lines.length === 1`.
- [ ] Chọn 1 variant ở single mode trả đúng variant đó (`itemId`, `sku`, `variantLabel`, `purchasePrice`/`sellingPrice`).
- [ ] `showQuantityPrice`/`defaultUnitPriceSource` vẫn hoạt động ở single mode (đơn giá mặc định prefill).
- [ ] Không còn chuỗi `"Chọn hàng hóa222"` trong repo.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Không đổi backend, không đổi `useProductSearch`/endpoint.
- [ ] No TODO/FIXME ngoài kế hoạch; chỉ chạm `ProductSelectDialog.tsx`.

## Tech Approach

```tsx
// Props
interface Props {
  // ...existing...
  selectionMode?: "single" | "multi"; // default "multi"
}

export function ProductSelectDialog({
  selectionMode = "multi",
  title = "Chọn hàng hóa", // was "Chọn hàng hóa222"
  // ...
}: Props) {
  const isSingle = selectionMode === "single";

  // khi chọn 1 item ở single mode: reset rồi set đúng item đó
  const toggleItem = (itemId: string) => {
    setSelectedItemIds((prev) => {
      if (isSingle) return new Set([itemId]);      // single: thay thế
      const next = new Set(prev);                   // multi: như cũ
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
    if (isSingle) setAutoSelectIds(new Set());      // single: không gom mẫu mã
  };
}
```

- Ở single mode: ẩn/disable checkbox "chọn tất cả" cấp mẫu mã + checkbox header (tránh chọn nhiều). Dùng cùng renderer hàng/variant, chỉ đổi behavior `toggleItem` + ẩn affordance multi.
- `onConfirm` tái dùng đúng pipeline build `lines` hiện có; ở single mode tập chọn chỉ có 1 itemId nên `lines` ra 1 phần tử — không cần nhánh riêng.

## Testing Strategy

- Thủ công trong Storybook/route tạm hoặc qua trang tích hợp ở TKT-PSF-03 (FE, không có unit test runner cho web app — `pnpm test` ở web chỉ echo).

## Dependencies

- Depends on: —
- Blocks: TKT-PSF-03, TKT-PSF-04
