# TKT-WHC-06 FE: Mã kho read-only trong form Kho lưu trữ

## Epic

[EPIC-21062026 Warehouse Code Auto-Generation](../epics/EPIC-21062026-warehouse-code-autogen.md)

## Summary

Form "Kho lưu trữ" (generic `CrudRecordDialog`, route `/admin/inventory-storages`) hiện render Mã kho là input cho-sửa, bắt buộc. Sau khi BE đặt `code` thành `readOnly` (TKT-WHC-02), form cần hiển thị Mã kho **chỉ đọc**:
- **Create:** không có input nhập mã; hiển thị placeholder "Tự động sinh khi lưu" (hoặc ẩn). Không gửi `code` trong payload.
- **Edit:** hiển thị giá trị `code` dạng read-only (không sửa được).

Reuse cách FE đã xử lý mã NCC của nhà cung cấp (`CrudRecordDialog` đã có nhánh `isSupplier`/`DISPLAY_ONLY_KEYS` + loại `code` khỏi payload edit).

## Deliverables

- `apps/backoffice-web/src/components/crud/CrudRecordDialog.tsx` và/hoặc `CrudFieldInput.tsx` — đảm bảo field `readOnly` (như `code`) render dạng hiển thị (không phải input cho-sửa) ở cả create lẫn edit, và **không** nằm trong payload create/update.
- Nếu cần, tổng quát hóa pattern `isSupplier` hiện tại để áp cho storage thay vì hard-code per-entity (ưu tiên dùng flag `readOnly` của config — đã có từ TKT-WHC-02 — thay vì thêm special-case mới).

## Acceptance Criteria

- [ ] Dialog "Thêm mới Kho lưu trữ": không có ô nhập Mã kho cho-sửa; lưu thành công không gửi `code`; bản ghi trả về có `code` WH.
- [ ] Dialog "Sửa Kho lưu trữ": Mã kho hiển thị read-only đúng giá trị, không sửa được; submit không gửi `code`.
- [ ] Không hồi quy các field readOnly khác (`branchName`, `isDefaultReceiving`, `Loại kho`, `createdAt`) và không ảnh hưởng form nhà cung cấp.

## Definition of Done

- [ ] `pnpm build` FE xanh.
- [ ] Verify trực quan: screenshot create (không ô mã / placeholder) + edit (mã read-only). Mô tả diff.
- [ ] Strings người dùng tiếng Việt; không để lộ enum/giá trị tiếng Anh ra UI label.

## Tech Approach

- Dựa vào `field.readOnly` để quyết định render hiển thị vs input trong `CrudFieldInput`, và loại `readOnly` keys khỏi `buildPayload` trong `CrudRecordDialog` (đã có `editableFields` loại sẵn readOnly — xác nhận create cũng dùng `editableFields`).
- Với create + read-only + value rỗng: hiển thị placeholder "Tự động sinh khi lưu".

## Testing Strategy

- Manual trên backoffice (`make dev-backoffice`): mở dialog create + edit storage, kiểm tra Mã kho.

## Dependencies

- Depends on: TKT-WHC-02 (config `readOnly`), TKT-WHC-05 (api-client)
- Blocks: —
