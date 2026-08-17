---
id: UOW-02
slug: committing-sale
title: Đơn bán đi qua saga và ghi thật, đạt parity với luồng cũ
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15]
risk: high
status: todo
rollback: tắt route bằng cách gỡ `CheckoutSagaModule` khỏi `pos.module.ts`; hóa đơn đã ghi qua v2 giống hệt hóa đơn v1 nên không cần dọn dữ liệu
---

# UOW-02 — Đơn bán ghi thật

Lát này mở transaction và ghi phần lõi hóa đơn: saga row, khoá đơn, cấp số, hóa đơn, thanh toán,
công nợ, điểm. Trừ kho / bút toán / thu quỹ **vẫn chưa** vào (UOW-03) — nên hóa đơn v2 ở lát này
chưa đủ hệ quả để dùng thật, và POS vẫn gọi v1. Đây là lát chứng minh phần khó nhất: chống trùng,
chống đua, và cấp số không nhảy.

Rủi ro cao nhất của cả epic nằm ở đây: step cấp số (ADR-02) chép ~40 dòng thuần từ
`DocumentNumberingService` vì chúng là private (A-06), và phải sống chung với luồng v1 đang dùng
`SERIALIZABLE` trên cùng dòng counter (A-14).

## Demo script

1. Bán thu đủ tiền mặt qua `/v2` → hóa đơn PAID, có `code` thật, đúng 1 dòng `invoice_payments`,
   không có `invoice_debts` (AC-05).
2. Bán công nợ và bán trả một phần → `DEBT` / `PARTIAL_DEBT`, `invoice_debts.remainingAmount` đúng,
   có `dueDate` và `creditDays` (AC-06).
3. Trả thừa, và còn nợ mà không chọn khách → 400, không dòng nào ghi (AC-07).
4. Chia tiền mặt + chuyển khoản → mỗi dòng mang đúng `accountId`/`depositAccountId` (AC-08).
5. Đơn có đổi điểm → thẻ bị trừ, có `point_history` REDEEM, `pointsBalanceAfter` khớp (AC-09).
6. Gọi lại đúng request với cùng `x-idempotency-key` → nhận lại đúng kết quả cũ, không có hóa đơn
   thứ hai (AC-10).
7. Bắn hai request checkout đồng thời trên cùng draft, **không** gửi idempotency key → một thắng,
   một 409, chỉ một mã hóa đơn (đã kiểm chứng trên `/v2`, T-02-09). **Chạy đúng kịch bản này trên
   `/v1`** (chạy tay 2026-08-05) — đây là bằng chứng trực quan nhất cho cả epic (AC-11): `invoices`
   giữ nguyên 24→24 (checkout là UPDATE trên draft có sẵn, không INSERT), nhưng
   **`invoice_payments` đi từ 23→25 — hai dòng thanh toán cho một hóa đơn, một lần checkout** — v1
   không có khoá nên cả hai request đều ghi trọn vẹn. `stock_ledger_entries`/`journal_entries`/
   `cash_movements` cũng nhích (do hai publish Kafka riêng biệt) nhưng đi qua consumer bất đồng bộ nên
   không dùng làm bằng chứng đo chính xác số lần ghi — `invoice_payments` (ghi đồng bộ trong transaction
   của chính `runCheckout`) mới là bằng chứng sạch.
8. Ép một step sau bước cấp số ném lỗi → `SELECT current_value` của counter không đổi; chạy xen kẽ
   10 đơn v1 và 10 đơn v2 → 20 mã liền mạch (AC-15).
9. Mở `GET /v2/pos/checkout/sagas/:id` của một đơn thành công và của một đơn hỏng → trail đầy đủ,
   đúng step hỏng (AC-12, AC-13).

## In scope

- Phase transactional trong orchestrator, gồm nhánh ghi trail FAILED ở transaction thứ hai (ADR-01).
- Step 06–13 và 19: `open-saga`, `lock-invoice`, `next-document-number`, `persist-invoice`,
  `persist-payments`, `create-debt`, `redeem-points`, `close-saga`.
- Chống trùng ở tầng DB (ADR-05) và test parity định dạng số (ADR-02, A-06).

## Not in scope

- Trừ kho, bút toán, thu quỹ, outbox (UOW-03) — nên chưa chuyển POS sang v2.
- `redeem-voucher` (UOW-05) và khuyến mại thật (UOW-04).

## Risks

| Risk | Mitigation |
|---|---|
| Chép `formatDocumentNumber`/`computeResetKey` rồi trôi lệch so với bản gốc (A-06) | T-02-06 là test parity trên ma trận 3 dạng rule × 4 `ResetPolicy`; lệch một ký tự là gãy |
| v1 (`SERIALIZABLE`) và v2 (`FOR UPDATE`) tranh cùng dòng counter, sinh deadlock (A-14) | AC-15 chạy xen kẽ 10+10 đơn; v1 đã có sẵn đường retry `40001` tại `document-numbering.service.ts:343` |
| Giữ khoá counter tới COMMIT làm chậm (A-09) | Đo ở T-03-09; đường lùi đã ghi trong ADR-02 |
| Partial unique index chặn nhầm lần chạy lại sau khi FAILED | T-02-02 có test riêng: chạy hỏng rồi chạy lại phải thành công (AC-11) |
| Ghi trail FAILED ở transaction thứ hai lại ném lỗi và nuốt mất lỗi gốc | T-02-01: bọc `try/catch` quanh nhánh ghi trail, log cảnh báo, **luôn** ném lại lỗi gốc |

## Definition of done

- [x] AC-05…AC-15 pass (AC-05–09, AC-12 ở T-02-08; AC-10, AC-11, AC-13, AC-15 ở T-02-09; AC-14 ở T-02-06)
- [x] Hóa đơn v2 và hóa đơn v1 trên cùng draft cho ra bộ dòng giống hệt ở `invoices`, `invoice_payments`, `invoice_debts`
- [x] Kịch bản hai request đồng thời: v2 cho một hóa đơn, và đã ghi lại bằng chứng v1 cho hai
- [x] Counter không tăng khi transaction rollback
- [x] Chỉ các file cũ trong danh sách 5 ngoại lệ bị sửa (chỉ `pos.module.ts`, dùng đúng 1/5 ngoại lệ)
- [ ] Demoed và accepted at gate G4
