---
id: UOW-02
slug: refund-payment-party
title: Phiếu chi hoàn tiền đổi trả ghi rõ trả cho ai
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-06, AC-07, AC-08]
risk: low
status: todo
rollback: bỏ hai lệnh gán `...party` trong hai consumer hoàn tiền
---

# UOW-02 — Phiếu chi hoàn tiền đổi trả ghi rõ trả cho ai

Đối xứng với UOW-01, nhưng ở chiều tiền ra và trên **hai** họ chứng từ: hoàn tiền mặt sinh
`cash_payments`, hoàn qua tiền gửi sinh `bank_payments`. Hai bảng dùng tên cột khác nhau cho
cùng một ý — `payee_name` chung, nhưng nhân viên thì `staff_id` bên cash và `paid_by` bên
bank. Bảng map đã có sẵn trong docblock của `voucher-party.ts`; đọc nó trước khi gán.

Đây là toàn bộ "phiếu chi" mà luồng checkout sinh ra (A-R2) — đơn bán không bao giờ sinh
phiếu chi.

## Demo script

1. POS → Đổi trả hàng → chọn một hoá đơn của khách **có** địa chỉ → trả một món →
   hình thức hoàn **tiền mặt** → chốt.
2. Backoffice → Sổ quỹ tiền mặt → mở phiếu chi vừa sinh: Đối tượng nhận = mã + tên khách,
   Người nhận = tên khách, Địa chỉ = địa chỉ khách, Nhân viên chi = mã + tên nhân viên.
3. Lặp bước 1 nhưng chọn hoàn qua **tiền gửi** → Sổ tiền gửi → phiếu chi ngân hàng cũng đủ
   bốn ô.
4. POS → trả nhanh, không chọn hoá đơn gốc, không có khách → hoàn tiền mặt → phiếu chi vẫn
   sinh, ba ô đối tượng trống, ô nhân viên vẫn có (AC-08).

## In scope

- `RefundCashConsumer` → `CashPaymentsService.createVoucherForMovement`.
- `RefundBankConsumer` → `BankPaymentsService.createAndPostInternal`.
- Spec cho cả hai.

## Not in scope

- Phiếu chi huỷ hoá đơn (`invoice-cancel-refund-cash.consumer.ts`) — không thuộc luồng
  checkout, đã loại ở `00-intent.md`.
- Phiếu chi mua hàng, phiếu chi khác.
- Đổi cách chọn quỹ hoàn tiền hay bút toán của phiếu trả.

## Risks

| Risk | Mitigation |
|---|---|
| Gán `staffId` cho `bank_payments` (cột không tồn tại) thay vì `paid_by` — TypeScript có thể không bắt nếu args nhận `staffId` rồi tự map | T-02-02 khẳng định trên **cột `paid_by` trong DB** |
| Phiếu trả nhanh không có khách làm consumer throw | AC-08 có case riêng; hàm snapshot đã không throw từ UOW-01 |
| Hoá đơn trả không mang `salesperson_id` (A-09) → ô nhân viên trống | Thoái lui `invoices.staff_id` của chính phiếu trả đã xử lý; T-02-01 có case |

## Definition of done

- [x] AC-06, AC-07, AC-08 xanh ở mức unit
- [x] ~~Khẳng định trên **cột DB**~~ — **KHÔNG làm được**, đóng G4 với nó còn mở (Akenzy,
      2026-08-15). Xem `## Verification evidence` bên dưới để biết chính xác còn thiếu gì
- [x] `pnpm --filter @erp/api test` xanh (2580 passed)
- [x] ~~Demo script~~ — **KHÔNG chạy**. Luồng đổi trả chưa được click-through lần nào
- [x] Accepted at gate G4 **không kèm demo** — Akenzy, 2026-08-15

Ô "cột DB" **cố ý để trống**. Test hiện khẳng định ở mức tham số truyền vào service, và
`bank_payments` được bảo vệ thêm bằng khẳng định `args.staffId === undefined` (bắt đúng kiểu
gán nhầm). Nhưng chưa có hàng thật nào cho đường đổi trả — khác với UOW-03/04 đã có e2e.
Đóng ô này cần hoặc một e2e cho luồng hoàn tiền, hoặc chính Demo script ở trên. Không tự tick.

## Verification evidence
- [x] `verify.py --write` xanh 5/5 trên `local-backoffice` — nhưng **không bước nào chạm luồng
      đổi trả**
- [x] AC-06 / AC-07 / AC-08 **không có ảnh và không có hàng thật**. Đây là chỗ hụt lớn nhất
      của feature, đã nêu từ khi lập kế hoạch (ô "cột DB" trong DoD ở trên cố ý để trống) và
      Akenzy chấp nhận đóng G4 với nó còn mở. Hiện chỉ có unit test `RefundCashConsumer` /
      `RefundBankConsumer` khẳng định ở mức tham số truyền vào service
- [x] Việc cần làm khi mở lại: bán → trả một phần hoàn tiền mặt, rồi hoàn qua tiền gửi, và
      đọc `cash_payments.staff_id` + `bank_payments.paid_by` trên hàng thật
- [x] `08-evidence.md` đã sinh lại; commit sha trong `run.json` = `88296e93` = HEAD
- [x] PR draft + `contact-sheet-local-backoffice.png` đã sinh dưới `evidence/`. **Chưa mở PR**
      — công việc còn uncommitted trên `feat/promotions`, nên chưa có gì để đính kèm vào

> **Đóng G4 có ngoại lệ, do Akenzy quyết ngày 2026-08-15.** `evidence_check.py` đòi một ảnh
> chụp cho **mọi** AC trong `verifies:`; 13/15 AC của feature này không có bề mặt UI để chụp
> (bất biến sổ sách, replay, hồi quy test). Ngoại lệ được ghi ở đây thay vì giấu bằng cách
> thu hẹp `verifies:` — kế hoạch giữ nguyên, chỗ hụt nói thẳng.
