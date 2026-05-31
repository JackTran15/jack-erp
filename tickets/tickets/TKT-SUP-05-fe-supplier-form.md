# TKT-SUP-05 FE: Supplier custom create/edit form

## Epic

[EPIC-29052026 Supplier & Supplier Group management](../epics/EPIC-29052026-supplier-management.md)

## Layer

🟩 Frontend only (backoffice-web).

## Summary

Form **Nhà cung cấp** theo mockup: toggle Tổ chức/Cá nhân đổi bộ field, section "Người liên hệ" (cho tổ chức), field CMND (cho cá nhân), picker nhóm NCC tìm kiếm, công nợ/ngân hàng, "Là khách hàng". Generic auto-form không kham được nên dựng form tuỳ biến và wire vào CẢ `CrudCreatePage` và `CrudEditPage`.

## Deliverables

- `apps/backoffice-web/src/components/crud/inventory/SupplierCreateForm.tsx` (mẫu theo `InventoryItemCreateForm.tsx`, props `{ editableFields, values, setValues, errors, setErrors, entityKey, isSaving }`):
  - `RadioGroup` (components/forms/RadioGroup.tsx) Tổ chức/Cá nhân bind `values.type` (default `organization`); đổi type chỉ ẩn/hiện field, giữ giá trị bộ kia (cột nullable).
  - **Common:** `name`, `address`, `phone`, `email`, picker nhóm NCC (`SearchListingInput` → `provider-groups`, lưu `groupId` + label local theo pattern `providerSummary`), `maxDebt` (`MoneyInput`), `debtTermDays` (number), `bankName`, `bankAccountNumber`, `bankBranch`, `isCustomer` (checkbox), `isActive` (checkbox). `code` read-only "(tự động)" khi tạo, hiện giá trị khi sửa.
  - **Org-only:** `taxCode` + section "Người liên hệ": `contactTitle` (Ông/Bà select), `contactName`, `contactEmail`, `contactPhone`, `contactPosition`, `contactAddress`.
  - **Individual-only:** `salutation` (Ông/Bà), `idCardNumber`, `idCardIssueDate` (input date, gửi `YYYY-MM-DD`), `idCardIssuePlace`.
- `apps/backoffice-web/src/components/crud/CrudCreatePage.tsx`:
  - Mở rộng swap ở `:140` để render `<SupplierCreateForm/>` khi `entityKey === 'inventory-providers'`.
  - Mở rộng nhánh payload ở `:98`: với `inventory-providers` gửi `{ ...values }` (như inventory-items) thay vì chỉ `editableFields`.
- `apps/backoffice-web/src/components/crud/CrudEditPage.tsx`:
  - Thêm swap (hiện CHƯA có) render `SupplierCreateForm` prefilled từ `record` (gồm `type`, `groupId` + label nhóm) khi `entityKey === 'inventory-providers'`.
  - Thêm nhánh payload `{ ...values }` cho `inventory-providers`. **Bắt buộc** — không có sẽ rơi về grid generic phẳng khi sửa.

## Acceptance Criteria

- [ ] `/admin/inventory-providers` "Thêm mới" mở form tuỳ biến; toggle Tổ chức↔Cá nhân đổi đúng bộ field.
- [ ] Chọn nhóm NCC qua picker; lưu → row mới hiện đúng `type` + tên nhóm + `code` auto (`NCC…`).
- [ ] "Sửa" mở lại form tuỳ biến prefilled đúng type/nhóm; lưu cập nhật đúng.
- [ ] `maxDebt` hiển thị/nhập đúng định dạng tiền (coerce string→number); `idCardIssueDate` cắt còn `YYYY-MM-DD`.
- [ ] Chỉ `name` bắt buộc; mọi chuỗi UI tiếng Việt; số/tiền format `vi-VN`.

## Definition of Done

- [ ] PR FE; `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Test thủ công create + edit cho cả tổ chức và cá nhân trên :3000, đối chiếu mockup.

## Tech Approach

- Submit qua mutation generic `useCrudCreate/useCrudUpdate('inventory-providers')` → `/admin/entities/inventory-providers/records`. KHÔNG dùng controller `inventory/providers` (sẽ bỏ qua code-gen/resolve group). Field computed (`groupName`) gửi kèm vô hại — TypeORM bỏ qua key không phải cột.
- Picker nhóm dùng `SearchListingInput` trực tiếp trong form tuỳ biến (toàn quyền layout).

## Dependencies

- Requires: TKT-SUP-03 (backend provider config + code-gen). Picker nhóm cần TKT-SUP-02.
