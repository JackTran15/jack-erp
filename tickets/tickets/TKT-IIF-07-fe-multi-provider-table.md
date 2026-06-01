# TKT-IIF-07 FE multi-provider table

## Epic

[EPIC-31052026 Inventory Item Form Refactor](../epics/EPIC-31052026-inventory-item-form-refactor.md)

## Summary

Thay `ProvidersPlaceholderTable` (stub) bằng bảng nhà cung cấp thật (ảnh #8) trong sub-tab "Nhà cung cấp": chọn nhiều NCC, hiển thị Mã/Tên/Địa chỉ, xóa dòng, quick-create NCC. Map sang `providers[]` của item payload (BE đã hỗ trợ create từ EPIC-010 và update từ TKT-IIF-03).

## Deliverables

- `apps/backoffice-web/src/components/crud/inventory/item-create/ItemProvidersTable.tsx` (new, thay `ProvidersPlaceholderTable.tsx`) — `LineItemGrid` cột:
  - `STT` (readonly, index).
  - `Mã nhà cung cấp` — `LookupField` search `inventory-providers` (`useProviders`), `onCreateNew` → quick-create provider (giữ dialog provider hiện có), placeholder "Tìm mã hoặc tên".
  - `Tên nhà cung cấp` (readonly từ selection).
  - `Địa chỉ` (readonly từ selection).
  - cột xóa.
- Cập nhật `InventoryItemCreateForm` để render `ItemProvidersTable` ở sub-tab "Nhà cung cấp" (thay placeholder) và gom selection vào `values.providers = [{ providerId, isPrimary }]` (dòng đầu tiên `isPrimary: true` mặc định, hoặc cờ chọn primary).
- Xóa `ProvidersPlaceholderTable.tsx` + mọi import.

## Acceptance Criteria

- [ ] Thêm ≥2 NCC qua lookup; mỗi dòng hiển thị Mã/Tên/Địa chỉ đúng từ provider đã chọn.
- [ ] Xóa dòng hoạt động; không cho trùng providerId (chặn hoặc cảnh báo).
- [ ] Submit gửi `providers[]` đúng; đúng 1 primary.
- [ ] Quick-create NCC mới → tự điền vào dòng đang chọn, không mất state form.
- [ ] Khi edit (TKT-IIF-08) bảng load đúng providers hiện có của item.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Không còn `ProvidersPlaceholderTable` / message "sẽ khả dụng khi máy chủ hỗ trợ".
- [ ] Screenshot so ảnh #8.

## Tech Approach

- Tái dùng `LookupField` với `columns` (Mã/Tên) như picker provider hiện có; lưu thêm `address` vào row state để render readonly.
- Provider list: `useProviders(search)` (TKT-IIF-04); quick-create dùng `useCrudCreate("inventory-providers")` đã có.

## Testing Strategy

- Manual: tạo item 2 NCC, lưu, reload edit thấy đủ 2 NCC + đúng primary.

## Dependencies

- Depends on: TKT-IIF-03 (update providers reconcile), TKT-IIF-06 (sub-tab host).
- Blocks: TKT-IIF-08 (edit load providers).
