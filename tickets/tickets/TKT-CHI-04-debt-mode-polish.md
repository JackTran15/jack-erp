# TKT-CHI-04 Trả nợ — polish khớp ảnh MISA (Nhà cung cấp / khoá Nhân viên chi)

## Epic

[EPIC-19072026 Phiếu chi tiền gửi — Hợp nhất theo Mục đích chi (MISA parity)](../epics/EPIC-19072026-deposit-payment-purpose-unification.md)

## Summary

Luồng "Trả nợ" đã hoạt động đúng (đã tự kiểm chứng bằng request thật trước epic này), nhưng UI lệch 2 điểm nhỏ so với ảnh #18: nhãn field và field "Nhân viên chi" không bị khoá. Ticket cosmetic, không đổi logic lưu.

## Deliverables

- `apps/backoffice-web/src/pages/treasury/documents/deposit-payment-voucher-dialog/DepositPaymentVoucherDialog.tsx` — 2 chỗ sửa nhỏ.

## Acceptance Criteria

- [ ] Khi Mục đích chi = Trả nợ: nhãn field đổi từ **"Đối tượng nhận"** thành **"Nhà cung cấp"** (khớp ảnh #18) — field khác (Người nhận/Địa chỉ/Lý do chi) giữ nguyên nhãn cũ.
- [ ] Khi Mục đích chi = Trả nợ: field "Nhân viên chi" (`VoucherStaffFields`) bị disable/grey-out giống các field khác đã khoá (`debtFieldsLocked`), khớp ảnh #18 (hiện tại chỉ `readOnly` chung mới khoá, không có `debtFieldsLocked`).
- [ ] Không đổi hành vi lưu, không đổi field nào khác.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Đối chiếu trực quan với ảnh #18 (chụp lại UI sau khi sửa, so sánh cạnh nhau).

## Tech Approach

`LABELS.counterparty` hiện là hằng số tĩnh dùng chung mọi mục đích (dòng 63). Đổi cách truyền `label` cho `VoucherPartnerFields` (dòng 585) thành biểu thức điều kiện:

```tsx
<VoucherPartnerFields
  label={isSupplierPayment ? "Nhà cung cấp" : LABELS.counterparty}
  ...
```

`VoucherStaffFields` (dòng 643-666) thêm `disabled`-tương-đương: kiểm tra prop component này hỗ trợ gì (có thể chỉ có `readOnly`) — nếu chỉ có `readOnly`, đổi:

```tsx
<VoucherStaffFields
  readOnly={readOnly || debtFieldsLocked}
  ...
```

(hiện đang chỉ truyền `readOnly={readOnly}`, dòng 645) — cùng pattern `debtFieldsLocked` đã dùng cho Người nhận/Địa chỉ/Lý do chi.

## Dependencies

- Depends on: [TKT-CHI-02](./TKT-CHI-02-dialog-restructure.md)
- Blocks: [TKT-CHI-05](./TKT-CHI-05-manual-test-plan.md)
