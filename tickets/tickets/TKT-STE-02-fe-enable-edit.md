# TKT-STE-02 FE: bật "Sửa" cho phiếu POSTED + xác nhận điều chỉnh tồn

## Epic

[EPIC-09062026 Sửa phiếu chuyển kho (POSTED)](../epics/EPIC-09062026-stock-transfer-edit.md)

## Layer

🟩 Frontend only (backoffice-web).

## Summary

Bật nút **"Sửa"** cho phiếu POSTED trên trang Chuyển kho và đảm bảo form sửa hoạt động end-to-end. Form `TransferFormDialog` mode `edit` đã prefill + `PATCH /:id` (từ epic trước) — chỉ cần cho phép mở với phiếu POSTED, thêm xác nhận "lưu sẽ điều chỉnh tồn kho", và reload danh sách + panel Chi tiết sau khi lưu.

## Deliverables

- `apps/backoffice-web/src/pages/stock-transfer/StockTransferPage.tsx`:
  - Nút "Sửa" trong toolbar: đổi `disabled: !selected || selected.status !== "DRAFT"` → **`disabled: !selected || selected.status === "CANCELLED"`** (cho sửa cả POSTED, chỉ chặn CANCELLED).
  - (Tùy chọn UX) Khi mở Sửa một phiếu **POSTED**, hiện `ConfirmActionModal` cảnh báo "Lưu thay đổi sẽ điều chỉnh (đảo + ghi lại) tồn kho." trước khi mở form — hoặc hiển thị dòng chú thích trong dialog. Giữ tối giản: chỉ cần mở form là đủ; cảnh báo là nice-to-have.
  - Sau khi `onSaved`: `loadRecords()` (đã có) — panel "Chi tiết" tự cập nhật vì đọc `selected` từ `records` mới. Đảm bảo `selectedId` được giữ để panel hiển thị phiếu vừa sửa.
- `TransferFormDialog` (cùng file): xác nhận mode `edit` với phiếu POSTED prefill đủ (transporter, lines storages/locations/qty/đơn giá, ngày giờ) và submit `PATCH /inventory/stock/transfers/:id` (đã có). Field `Số phiếu chuyển` readonly (đã có). Không cho sửa khi đang `view`.

## Acceptance Criteria

- [ ] Chọn phiếu POSTED → nút "Sửa" enable; mở form prefill đúng toàn bộ thông tin (trừ readonly Số phiếu chuyển).
- [ ] Sửa dòng/thông tin → Lưu → `PATCH /:id`; toast tiếng Việt; danh sách + footer Tổng tiền + panel Chi tiết cập nhật theo dữ liệu mới.
- [ ] Phiếu CANCELLED → nút "Sửa" disable.
- [ ] Lỗi BE (thiếu tồn / sửa phiếu hủy) hiển thị nguyên văn message; phiếu gốc giữ nguyên trên UI sau khi reload.

## Definition of Done

- [ ] `tsc` backoffice xanh; UI strings tiếng Việt; số/tiền `Intl` `vi-VN`.
- [ ] Verify trực quan: sửa 1 phiếu POSTED (đổi kho nhập/số lượng) → lưu thành công, Chi tiết + Tổng tiền đổi đúng.
- [ ] Không đổi `App.tsx`/`navConfig.ts`/`inventoryTabs.tsx`.

## Tech Approach

- Thay đổi tối thiểu: chủ yếu là điều kiện `disabled` của nút Sửa + (tùy chọn) confirm. Toàn bộ form + PATCH đã sẵn.

## Dependencies

- Requires: TKT-STE-01 (BE update POSTED).
- Blocks: TKT-STE-03 (verify).
