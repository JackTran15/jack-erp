# TKT-SUP-04 FE: Supplier Group page + relation searchable picker

## Epic

[EPIC-29052026 Supplier & Supplier Group management](../epics/EPIC-29052026-supplier-management.md)

## Layer

🟩 Frontend only (backoffice-web).

## Summary

Màn **Nhóm nhà cung cấp** dùng generic `CrudListPage` (không cần page riêng) tại `/admin/provider-groups` — route + nav đã có sẵn. Bổ sung picker tìm kiếm cho field `relation` (chọn nhóm cha "Thuộc nhóm NCC") trên trang create/edit generic, có guard để không đổi hành vi của `accounts`.

## Deliverables

- `apps/backoffice-web/src/components/crud/CrudFieldInput.tsx`:
  - Thêm nhánh render cho `field.type === 'relation'`: NẾU có entry config (theo `{entityKey, field.key}`) thì render `SearchListingInput` (components/forms/SearchListingInput.tsx) gọi `GET /admin/entities/{relationEntity}/records?page=1&pageSize=8&search=…` (reuse shape `SEARCH_FIELD_CONFIG` ở `CrudFormDialog.tsx:103-147`); NGƯỢC LẠI fallback về `<Input>` text như hiện tại (giữ nguyên `accounts.parentAccountId`).
  - Thêm entry cho `provider-groups.parentGroupId` (search theo code/name, label `code · name`, lưu `id`).
- (Tuỳ chọn) `apps/backoffice-web/src/components/table/pagination.dto.ts` — thêm block `"provider-groups"` vào `ENTITY_COLUMN_CONFIGS` (name large, parentGroupName medium). Có fallback nên không bắt buộc.

## Acceptance Criteria

- [ ] `/admin/provider-groups` list hiển thị cột Mã/Tên/Thuộc nhóm NCC (parentGroupName)/Mô tả/Trạng thái.
- [ ] "Thêm mới" + "Sửa" mở form generic; field "Thuộc nhóm NCC" là picker tìm kiếm chọn nhóm cha, lưu `parentGroupId`.
- [ ] Tạo nhóm con, set cha → list phản ánh đúng tên cha.
- [ ] Hành vi field `relation` của `accounts` KHÔNG đổi (vẫn input text vì không có entry config).
- [ ] Xoá nhóm hoạt động; mọi chuỗi UI tiếng Việt.

## Definition of Done

- [ ] PR FE; `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Test thủ công create/edit/delete + picker trên :3000.

## Tech Approach

- Không thêm route/nav (đã có `navConfig.ts:325`, generic `/admin/:entityKey/*` trong `App.tsx`).
- Picker dùng endpoint records generic, không cần API riêng cho nhóm NCC.
- Guard bằng config map để chỉ bật picker cho entity/field đã khai báo.

## Dependencies

- Requires: TKT-SUP-02 (backend `provider-groups`).
