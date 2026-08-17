---
id: UOW-01
slug: be-split-refund
title: Trả hàng đơn còn nợ tự cấn trừ trước, chi đúng phần khách đã trả
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-08, AC-10, AC-12, AC-13]
risk: high
status: todo
rollback: revert 1 migration (cột `offset_amount` mặc định 0) + revert service; hành vi cũ trở lại nguyên trạng vì không có bảng/enum mới
---

# UOW-01 — Tách khoản hoàn ở đường trả/đổi hàng

Lát cắt mang toàn bộ phần tiền: từ lúc tính khoản hoàn tới lúc công nợ giảm và phiếu chi
mang đúng số. Đây là lát duy nhất tự nó chặn được lỗi mất tiền — ba lát còn lại là hệ quả.

## Demo script

Chuẩn bị: một hoá đơn bán chịu đã post, phải thu 765.000, đã thu 300.000 (dư nợ 465.000).

1. `psql` — ghi lại `invoice_debts.remaining_amount` của hoá đơn gốc = 465.000
2. Gọi `POST /invoices/:draftId/checkout-return` với `refundMethod: "CASH"` (không kèm cờ
   nào khác), giỏ trả toàn bộ hàng
3. Response 201: `refundedAmount = 765000`, `offsetAmount = 465000`
4. `psql` — `invoice_debts` của hoá đơn gốc: `remaining_amount = 0`, `status = paid`
5. `psql` — `cash_payments`/phiếu chi sinh từ phiếu trả: **300.000**, không phải 765.000
6. Lặp lại với hoá đơn bán chịu toàn phần (đã thu 0) → không có phiếu chi nào được tạo
7. Lặp lại với hoá đơn thu đủ tiền mặt → `offsetAmount = 0`, phiếu chi đủ 765.000

## In scope

- Tra dư nợ hoá đơn gốc có khoá bi quan, tính `offsetAmount` / `cashOutAmount`
- Ghi `invoices.offset_amount`, giảm công nợ, dòng ADJUSTMENT trong tab Công nợ
- Phát `CASH_REFUND` / `DEPOSIT_REFUND` theo `cashOutAmount`, bỏ qua khi bằng 0
- `refundMethod = OFFSET` từ client cũ được xem như `CASH`

## Not in scope

- Bút toán kế toán hai chân (UOW-02)
- Huỷ phiếu trả (UOW-03)
- Màn hình POS (UOW-04)

## Risks

| Risk | Mitigation |
|---|---|
| Khoá bi quan gây tranh chấp với phiếu thu nợ đồng thời | Khoá đặt trong transaction đã có sẵn, phạm vi một dòng; timeout trả 409 rõ nghĩa (error taxonomy) |
| Bất biến A-06 sai ở ca biên chưa nghĩ tới | T-01-05 viết property test trên bộ sinh ngẫu nhiên, không chỉ ví dụ cố định |
| `refundedAmount` vốn có thể vượt `amountDue` ở ca lạ | T-01-05 khẳng định `r ≤ amountDue` trên toàn bộ fixture; nếu vỡ thì mở lại A-06 |

## Definition of done

- [x] AC-01..AC-06, AC-08, AC-10, AC-12, AC-13 pass
- [x] `pnpm --filter @erp/api test` xanh, không sửa kỳ vọng cũ nào ngoài các ca OFFSET đã đổi nghĩa
- [x] Migration chạy được và revert được trên `erp_dev`
- [x] Không còn nhánh nào đọc `dto.refundMethod === OFFSET` để quyết định có cấn trừ hay không
- [ ] Demoed và accepted at gate G4
