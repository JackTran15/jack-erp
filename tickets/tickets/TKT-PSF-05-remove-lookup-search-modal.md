# TKT-PSF-05 Verify product pickers migrated + build (LookupSearchModal STAYS)

## Epic

[EPIC-21062026 Thay modal "Chọn hàng hóa" cũ bằng ProductSelectDialog (single-fill)](../epics/EPIC-21062026-product-picker-single-fill.md)

## Summary

> **Sửa giả định ban đầu:** `LookupSearchModal`/`enableSearchModal` **KHÔNG** chỉ dùng cho product. Nó còn phục vụ rất nhiều lookup khác: "Chọn kho", "Chọn vị trí", "Chọn đối tượng", "Chọn lý do xuất kho", "Chọn cửa hàng nguồn/đích", "Chọn người vận chuyển", "Chọn chi nhánh đích". → **Giữ nguyên** `LookupSearchModal` và `enableSearchModal`; chỉ migrate đúng các lookup **sản phẩm** (title "Chọn hàng hóa"/"Chọn mặt hàng") sang single-fill.

Ticket này chỉ xác minh việc migrate đã sạch và build xanh — **không xoá** component nào.

## Deliverables

- Không xoá file. `LookupField.tsx` giữ nguyên `enableSearchModal`/`searchModalTitle`/`searchModalPlaceholder` (còn dùng) **và** `onSearchButtonClick` (đã có sẵn, dùng cho single-fill).
- Verify-only.

## Acceptance Criteria

- [ ] `grep -rn 'searchModalTitle="Chọn hàng hóa"\|searchModalTitle="Chọn mặt hàng"' apps/backoffice-web/src` → **0 kết quả** (không còn product picker nào dùng modal cũ).
- [ ] `grep -rn "Chọn hàng hóa222" apps/backoffice-web/src` → 0 kết quả.
- [ ] Các `searchModalTitle` còn lại đều là lookup **không phải sản phẩm** (kho/vị trí/đối tượng/lý do/cửa hàng/người vận chuyển/chi nhánh) — giữ nguyên.
- [ ] Cả 5 trang line-editor có `onSearchButtonClick` trên ô SKU sản phẩm.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Kiểm tay 5 trang: ô SKU sản phẩm mở `ProductSelectDialog` (single); các lookup khác (kho/vị trí/…) vẫn mở `LookupSearchModal` như cũ.

## Tech Approach

```bash
grep -rn 'searchModalTitle="Chọn hàng hóa"\|searchModalTitle="Chọn mặt hàng"' apps/backoffice-web/src   # 0
grep -rn "Chọn hàng hóa222" apps/backoffice-web/src                                                       # 0
pnpm --filter @erp/backoffice-web build
```

## Testing Strategy

- Grep + build + kiểm tay 5 trang.

## Dependencies

- Depends on: TKT-PSF-03, TKT-PSF-04
- Blocks: —
