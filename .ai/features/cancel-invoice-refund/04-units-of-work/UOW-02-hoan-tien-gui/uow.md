---
id: UOW-02
slug: hoan-tien-gui
title: Hủy hóa đơn chuyển khoản sinh phiếu chi tiền gửi, trừ quỹ đúng một lần
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-05, AC-06, AC-07]
risk: high
status: todo
rollback: Revert `DepositRefundConsumer` về nhánh ghi movement thô — hành vi quay lại đúng như trước epic
---

# UOW-02 — Hoàn tiền gửi bằng phiếu chi

Chân tiền gửi hôm nay đã trừ đúng số dư nhưng bằng một movement không chứng từ.
Lát cắt này thay movement thô bằng một phiếu chi tiền gửi sở hữu movement (ADR-04) —
việc nguy hiểm nhất là làm sao không trừ quỹ hai lần trong lúc chuyển đổi.

## Demo script

1. Bán một hóa đơn 2.000.000₫ trả bằng chuyển khoản vào một tài khoản tiền gửi.
   Ghi lại số dư tài khoản đó ở Backoffice → Sổ chi tiết tiền gửi.
2. Gọi `POST /invoices/:id/cancel`.
3. Mở Backoffice → Phiếu chi tiền gửi (UNC): có một phiếu mới 2.000.000₫, POSTED,
   đúng tài khoản đã nhận tiền.
4. Mở lại Sổ chi tiết tiền gửi: số dư giảm đúng 2.000.000₫ — **một** lần, không phải hai.
5. Bán hóa đơn 3.000.000₫ trả hỗn hợp 1.000.000₫ tiền mặt + 2.000.000₫ chuyển khoản, rồi hủy:
   có một phiếu chi tiền mặt 1.000.000₫ và một phiếu chi tiền gửi 2.000.000₫.

## In scope

- `DepositRefundConsumer` đổi sang `BankPaymentsService.createAndPostInternal`
- Dọn đường ghi movement thô trong `DepositRefundService`
- E2E chuyển khoản đơn thuần và hỗn hợp

## Not in scope

- Sinh phiếu thu tiền gửi ở checkout (A-14) — nên chân này không có cặp để nối
- Hóa đơn thu vào từ hai tài khoản tiền gửi trở lên: cố ý dừng và đẩy DLQ (ADR-06)

## Risks

| Risk | Mitigation |
|---|---|
| Vừa giữ movement thô vừa thêm phiếu chi → trừ quỹ hai lần | T-02-01 xóa nhánh cũ trong cùng lần sửa; T-02-03 kiểm số dư giảm đúng một lần |
| `reverseForCancelledInvoice` còn caller khác ngoài luồng hủy | T-02-02 bắt buộc grep toàn repo trước khi xóa |
| Kỳ kế toán bị khóa làm phiếu chi ném lỗi | Cố ý cho rơi DLQ để retry sau khi mở kỳ — đã ghi ở Error taxonomy |

## Definition of done

- [ ] AC-05, AC-06, AC-07 pass
- [ ] Demo script chạy được từ đầu đến cuối
- [ ] Không còn đường nào ghi deposit movement thô trong luồng hủy hóa đơn
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] Demoed và accepted ở gate G4
