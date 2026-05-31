# TKT-IIF-05 FE quick-create & list dialogs

## Epic

[EPIC-31052026 Inventory Item Form Refactor](../epics/EPIC-31052026-inventory-item-form-refactor.md)

## Summary

Dựng 4 dialog khớp ảnh tham chiếu, dùng `AppModal` + `PageTabBar` + `LineItemGrid` từ `@erp/ui` và hooks ở TKT-IIF-04:
- **Thêm mới Thương hiệu** (#3) — 1 field.
- **Danh sách thương hiệu** (#6) — list + xóa + quick-add inline.
- **Thêm mới nhóm hàng hóa** (#4/#5) — 2 tab (Thông tin chung + Hoa hồng).
- **Thêm mới đơn vị tính** (#7) — 2 field.

## Deliverables

- `apps/backoffice-web/src/components/crud/inventory/item-create/dialogs/BrandCreateDialog.tsx` (new) — `AppModal` title "Thêm mới Thương hiệu", field `Tên thương hiệu *`, footer Lưu/Hủy bỏ → `useCreateBrand` → `onCreated(brand)`.
- `.../dialogs/BrandListDialog.tsx` (new) — `AppModal` title "Danh sách thương hiệu", `LineItemGrid` cột "Tên thương hiệu" + hàng filter + xóa (`useDeleteBrand`), hàng `*` quick-add inline; chọn 1 brand → `onPick(brand)`.
- `.../dialogs/ItemCategoryCreateDialog.tsx` (new) — `AppModal` title "Thêm mới nhóm hàng hóa", `PageTabBar` 2 tab:
  - **Thông tin chung**: `Mã nhóm hàng hóa *`, `Tên nhóm hàng hóa *`, `Thuộc nhóm` (select từ `useItemCategories`), `Mô tả` (textarea).
  - **Hoa hồng**: `LineItemGrid` cột Vị trí công việc / Cách tính hoa hồng (select PERCENT|AMOUNT) / Mức tính (number) / Giới hạn giảm giá được tính hoa hồng (%) + add/delete row.
  - Lưu → `useCreateItemCategory({ code, name, parentGroupId, description, commissions[] })` → `onCreated(category)`.
- `.../dialogs/UnitCreateDialog.tsx` (new) — `AppModal` title "Thêm mới đơn vị tính", `Đơn vị tính *` (name) + `Diễn giải` (description) → `useCreateItemUnit` → `onCreated(unit)`.
- Thay thế dần các picker hardcode trong `InventoryItemCreateDialogs.tsx` (Group/Brand suggestion) bằng dialog thật (giữ Category/Provider picker thật đang dùng).

## Acceptance Criteria

- [ ] 4 dialog render đúng layout từng ảnh (tiêu đề, field, nút Lưu/Hủy bỏ, "Trợ giúp" optional).
- [ ] Validation client: field `*` rỗng → chặn Lưu + báo lỗi.
- [ ] BrandListDialog: list thật từ API, xóa gọi `useDeleteBrand` (soft-delete BE) + biến mất khỏi list; quick-add tạo brand mới.
- [ ] ItemCategoryCreateDialog tab Hoa hồng: thêm/xóa dòng, gửi `commissions[]` đúng shape.
- [ ] Sau quick-create, **không mất state form cha** (form item vẫn giữ field đã nhập).
- [ ] Tất cả string người dùng = tiếng Việt; import primitive từ `@erp/ui`; icon từ `lucide-react`.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Named exports, `interface Props` tách riêng (không inline).
- [ ] Screenshot từng dialog so với ảnh #3/#4/#5/#6/#7 (mô tả diff nếu lệch).

## Tech Approach

- Dùng `AppModal` (`title`, `onSave`, `onCancel`, `footer` custom với nút `Lưu`/`Hủy bỏ`).
- Tab dùng `PageTabBar` (`items`, `activeId`, `onSelect`) — state tab cục bộ.
- Bảng commission / brand list dùng `LineItemGrid` (`columns` với `renderEditor`, `onAddRow`, `onDeleteRow`, `showRowActions`).
- State form dialog: `useState` local (codebase không dùng react-hook-form).

## Testing Strategy

- Manual + screenshot mỗi dialog; verify happy path tạo brand/category/unit hiển thị ngay trong picker form.

## Dependencies

- Depends on: TKT-IIF-04 (hooks).
- Blocks: TKT-IIF-06 (form wiring các nút "+").
