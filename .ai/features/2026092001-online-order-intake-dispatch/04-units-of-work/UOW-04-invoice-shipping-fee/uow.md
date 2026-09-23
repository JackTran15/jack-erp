---
id: UOW-04
slug: invoice-shipping-fee
title: Phí giao hàng nằm trên hoá đơn và vào đúng tổng phải thu
demoable: true
duration: 2d
depends_on: []
requirements: [US-07]
verifies: [AC-25, AC-26, AC-27]
risk: high
status: todo
rollback: revert migration (drop invoices.shipping_fee_amount) + revert computeAmountDue và hai bản sinh đôi; hoá đơn cũ có phí = 0 nên công thức cũ ra đúng số cũ — nhưng hoá đơn đã phát hành CÓ phí thì mất phần phí, phải revert TRƯỚC khi đơn web đầu tiên ra hoá đơn
---

# UOW-04 — Phí giao hàng trên hoá đơn

## Demo script
1. Qua API tạo một hoá đơn POS: tiền hàng 1.000.000, giảm giá 100.000, điểm tích giảm 50.000, phí GH 30.000
2. Adminer: `invoices.amount_due` = **880.000** (1.000.000 − 100.000 − 50.000 + 30.000)
3. Tạo hoá đơn thứ hai: tiền hàng 100.000, giảm giá 500.000, phí GH 30.000 → `amount_due` = **30.000** (phần tiền hàng chặn ở 0, phí vẫn thu)
4. Mở lưới hoá đơn POS → cột "Tổng thanh toán" của hai hoá đơn khớp đúng hai số trên
5. Dòng tổng dưới đáy lưới = 910.000 — khớp `SUM` của DB, không lệch
6. Lọc lưới theo khoảng tiền bao 880.000 → hoá đơn #1 lọt, #2 không (chứng minh `invoiceSignedTotalSql` dùng cùng công thức với footer)
7. Lập hoá đơn trả hàng cho #1 → hoá đơn RETURN không mang phí, số hoàn không gồm 30.000

## In scope
- `invoices.shipping_fee_amount`
- `computeAmountDue` đổi vị trí clamp (ADR-04)
- Hai bản sinh đôi: `invoiceSignedTotalSql`, `pos-web/src/lib/common/invoiceAmount.ts`
- Xác minh 7 nơi gọi `computeAmountDue` trong production

## Not in scope
- UI nhập phí trên POS — phí chỉ đến từ đơn web (UOW-05)
- Tài khoản hạch toán phí (A-21) — chưa hỏi kế toán, ticket riêng ở đợt sau
- Cột "Tiền phí" trong báo cáo EPIC-14062026 (giờ đã có backing, nhưng là epic khác)

## Risks
| Risk | Mitigation |
| --- | --- |
| Ba nơi tính tổng lệch nhau — comment trong `invoice-amount.util.ts` ghi rõ từng lệch thật một lần (26.337.000 đúng vs 28.927.000 sai-mà-trông-hợp-lý) | AC-26 là cái chặn: demo bước 4–6 so sánh cả ba nguồn trên cùng dữ liệu |
| Clamp sai chỗ ⇒ chiết khấu lớn nuốt mất phí giao | Demo bước 3 là ca kiểm riêng cho đúng lỗi này |
| Một trong 7 nơi gọi `computeAmountDue` truyền object thiếu `shippingFee` ⇒ phí âm thầm về 0 | T-04-04 duyệt từng nơi gọi; mặc định `?? 0` là **đúng** cho hoá đơn thường, nên phải kiểm bằng ca có phí ≠ 0 chứ không bằng đọc code |
| `invoice_debts.original_amount` lệch `amount_due` ⇒ công nợ COD thu thiếu | Kiểm ở UOW-05 khi đơn web ra hoá đơn thật |

## Definition of done
- [x] AC-25, AC-26, AC-27 có bằng chứng trong `07-verification.md`
- [x] Hoá đơn **không có phí** (mọi hoá đơn đang tồn tại) ra đúng số cũ từng đồng
- [x] `pnpm --filter @erp/api test` xanh; `tsc --noEmit` pos-web xanh
