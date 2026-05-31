# TKT-IIF-06 FE form layout refactor + dropdown wiring

## Epic

[EPIC-31052026 Inventory Item Form Refactor](../epics/EPIC-31052026-inventory-item-form-refactor.md)

## Summary

Refactor tab "Thông tin cơ bản" của `InventoryItemCreateForm` cho khớp ảnh #2: cột trái form chính, cột phải "Tồn kho ban đầu", và sub-tab "Đơn vị chuyển đổi" / "Nhà cung cấp". Wire 3 picker (Nhóm hàng hóa, Thương hiệu, Đơn vị tính cơ bản) vào API + nút "+" mở dialog ở TKT-IIF-05. Nâng bảng Đơn vị chuyển đổi (#9): ô "Tên đơn vị tính" thành dropdown lấy từ API units + quick-create.

## Deliverables

- `apps/backoffice-web/src/components/crud/inventory/InventoryItemCreateForm.tsx` — bố cục lại tab cơ bản:
  - **Cột trái:** Tên hàng hóa *, Nhóm hàng hóa (select API + "+" → `ItemCategoryCreateDialog`), Thương hiệu (select API + nút list "+" → `BrandCreateDialog`/`BrandListDialog`), Mã SKU (placeholder "Hệ thống tự sinh khi bỏ trống"), Mã vạch (placeholder tương tự), Giá mua, Giá bán, Đơn vị tính cơ bản (select API units + "+" → `UnitCreateDialog`) + helper text "(Nên để đơn vị tính nhỏ nhất...)".
  - **Cột phải:** Tồn kho ban đầu + helper "(Tồn kho ban đầu chỉ được nhập khi thêm mới hàng hóa.)" (disable khi edit).
  - **Sub-tabs** (`PageTabBar`): "Đơn vị chuyển đổi" | "Nhà cung cấp" + helper "(Nếu không chọn Đơn vị bán/nhập mặc định...)".
- `apps/backoffice-web/src/components/crud/inventory/item-create/ConversionUnitsTable.tsx` — ô "Tên đơn vị tính" đổi thành `LookupField`/select lấy từ `useItemUnits` + `onCreateNew` → `UnitCreateDialog`. Giữ map sang `units[]` như hiện tại.
- Map field: `category` → gửi `categoryId`; `brand` → gửi `brandId` (+ giữ tên brand để hiển thị); `unit` (string) = tên đơn vị cơ bản đã chọn.

## Acceptance Criteria

- [ ] Layout khớp ảnh #2 (thứ tự field, 2 cột, helper text, sub-tab) — mô tả diff nếu lệch.
- [ ] Nhóm hàng hóa / Thương hiệu / Đơn vị tính cơ bản load list từ API (không hardcode); nút "+" mở đúng dialog; sau tạo, picker tự chọn item vừa tạo.
- [ ] Bảng Đơn vị chuyển đổi: chọn đơn vị từ dropdown API; thêm/xóa dòng; gửi `units[]` đúng (ratio default 1, đúng 1 default sell + 1 default buy).
- [ ] Submit create vẫn 1 POST `/admin/entities/inventory-items/records` với `categoryId`/`brandId`/`unit`/`units[]`.
- [ ] Không regression các tab khác (Bổ sung / Kho / Hoa hồng vẫn chạy).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Semantic Tailwind tokens; primitives từ `@erp/ui`; icon `lucide-react`.
- [ ] Screenshot tab cơ bản so ảnh #2 + bảng đơn vị chuyển đổi so ảnh #9.

## Tech Approach

- Picker dùng `LookupField` (`search`, `onSelect`, `onCreateNew`, `portalToBody` để không bị dialog cắt) — đã có sẵn pattern ở `PurchaseOrdersPage`.
- Sub-tab dùng `PageTabBar`; render `ConversionUnitsTable` hoặc `ItemProvidersTable` (TKT-IIF-07) theo tab active.
- Giữ cơ chế sync `values` hiện có (useEffect gom `units`/`threshold`/extras vào `values`).

## Testing Strategy

- Manual: tạo item chọn nhóm + brand + đơn vị từ API; thêm đơn vị chuyển đổi; lưu thành công.

## Dependencies

- Depends on: TKT-IIF-04 (hooks), TKT-IIF-05 (dialogs).
- Blocks: TKT-IIF-07 (provider sub-tab), TKT-IIF-08 (edit).
