# TKT-ILP-01 Trích & tổng quát hoá ProductSelectDialog (từ InventoryExportSelectDialog)

## Epic

[EPIC-19062026 Dialog chọn hàng + gỡ trang v2](../epics/EPIC-19062026-inventory-line-product-picker.md)

## Summary

Tách `InventoryExportSelectDialog` thành component dùng chung `ProductSelectDialog` (layout #3/#4: dropdown "Nhóm hàng hóa", ô tìm kiếm, hàng mẫu mã + "+" bung variant, checkbox chọn-tất-cả, phân trang, footer "Đã chọn ... mẫu mã (... hàng hoá)"). **Chưa** thêm cột nhập — chỉ trích + tổng quát hoá props và `onConfirm` để trả về **dữ liệu hàng đã chọn** (không chỉ id). Trang inventory export tiếp tục chạy đúng qua adapter.

## Deliverables

- `apps/backoffice-web/src/components/shared/product-select/ProductSelectDialog.tsx` (mới) — chuyển từ `pages/inventory/_components/InventoryExportSelectDialog.tsx`.
- `apps/backoffice-web/src/components/shared/product-select/useProductSearch.ts` (mới) — chuyển từ `pages/inventory/_components/useInventoryProductGroups.ts` (`useInventoryProductGroups` + `useInventoryProductItems`, type `ProductGroupRow`/`ProductVariantRow`). Giữ endpoint `GET /inventory/items/products` và `GET /inventory/items/products/{productId}/items`.
- `apps/backoffice-web/src/pages/inventory/InventoryItemsPage.tsx` — đổi call site sang `ProductSelectDialog` (giữ hành vi xuất khẩu hiện tại qua props/adapter).
- Xoá `InventoryExportSelectDialog.tsx` cũ (đã chuyển), cập nhật import.

## Acceptance Criteria

- [ ] `ProductSelectDialog` nhận props tổng quát: `title?`, `confirmLabel?`, `initialSelectedIds?`, `categoryFilter?` (bật/tắt dropdown nhóm), và `onConfirm(selected: SelectedProduct[])`.
- [ ] `SelectedProduct` mang đủ dữ liệu để tạo dòng: `{ itemId, sku, name, unit, categoryName, purchasePrice, sellingPrice, variantLabel? }` (lấy từ cache variant + row mẫu mã/orphan).
- [ ] Trang inventory export vẫn chọn + tải file đúng (id mẫu mã chọn-tất-cả vs id lẻ vẫn map đúng tham số `downloadInventoryExportSelected`).
- [ ] Không đổi endpoint, không đổi logic lazy-load/cache variant, indeterminate checkbox, chọn-tất-cả theo trang.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh; không còn import treo tới `InventoryExportSelectDialog`/`useInventoryProductGroups` đường dẫn cũ.
- [ ] Verify thủ công trang inventory export: chọn mẫu mã + variant lẻ → xuất file đúng như trước.
- [ ] Không Vietnamese trong identifier/biến (chỉ chuỗi UI hiển thị tiếng Việt).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
// components/shared/product-select/ProductSelectDialog.tsx
export interface SelectedProduct {
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  categoryName: string | null;
  purchasePrice: number;
  sellingPrice: number;
  variantLabel?: string | null;
}

interface ProductSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;            // default "Chọn hàng hóa"
  confirmLabel?: string;     // default "Chọn"
  initialSelectedIds?: Set<string>;
  onConfirm: (selected: SelectedProduct[]) => void;
}
```

- Giữ state `selectedItemIds` / `autoSelectIds` / `expandedIds` / `variantCache` như cũ. Khi confirm: từ `variantCache` + dòng hiện tại dựng `SelectedProduct[]` (thay vì chỉ trả id).
- Inventory export: bọc `onConfirm` để tách lại `productIds` (mẫu mã chọn đủ) vs `standaloneItemIds` nếu cần giữ API tải file hiện tại — hoặc giữ một biến thể trả id cho riêng export.

## Testing Strategy

- Không có unit test FE (web app `test` = echo). Verify thủ công + `build`.

## Dependencies

- Depends on: —
- Blocks: TKT-ILP-02
