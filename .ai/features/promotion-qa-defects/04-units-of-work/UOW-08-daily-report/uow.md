---
id: UOW-08
slug: daily-report
title: Báo cáo cuối ngày khớp sổ quỹ và thấy được tiền khuyến mại
demoable: true
duration: 2d
depends_on: []
requirements: [US-09]
verifies: [AC-27, AC-28, AC-29, AC-30, AC-31]
risk: medium
status: todo
rollback: revert code — báo cáo là read-only, không ghi gì, revert là số quay lại ngay
---

# UOW-08 — Báo cáo theo ngày

Ba khiếm khuyết chồng lên nhau trong `get-pos-daily-summary.handler.ts`, tất cả nằm trong vòng lặp
cộng dồn **trên RAM** nên sửa bằng JS thuần, không phải viết lại SQL.

**Tiền khuyến mại vô hình.** Saga v2 ghi `invoice_checkout_promotions`; báo cáo đọc
`invoice_promotions` — bảng của luồng v1 mà saga không bao giờ chạm. 0 dòng, nên `revenue.voucher`
và `voucherCount` **luôn 0 về mặt cấu trúc**. 719.000đ tiền KM nằm ở `invoices.discount_amount`,
nhưng handler không đọc cột đó ở bất kỳ đâu.

**Tiền hoàn trừ hai lần.** Chú thích ở `:189-191` nói khoản hoàn "không đi qua phiếu chi" — sai sự
thật: `refund-cash.consumer.ts` tạo WITHDRAWAL **và** một Phiếu chi POSTED. Nên nó bị trừ một lần ở
`revenue.cash -= refundedAmount` và một lần nữa ở `expense.cash` (truy vấn không lọc purpose).

**Điểm tính thành doanh thu.** `pointsDiscountAmount` là khoản **giảm giá**, đã trừ trong
`amountDue`, không đồng nào vào quỹ — nhưng đang được cộng vào `revenue.total` rồi vào `netCashFlow`.

Chuẩn đối chiếu là `CashLedgerService`: một nguồn `cash_movements`, gắn dấu theo `type` — đó là lý do
Sổ quỹ khớp tuyệt đối còn báo cáo thì không. Không đổi báo cáo sang dùng nó (vượt phạm vi), nhưng
mọi con số phải khớp nó.

## Demo script

Chạy lại đúng dữ liệu ngày 13/08 rồi đối chiếu bằng số:

1. Tiền khuyến mại hiển thị **719.000**, không phải 0 (AC-27).
2. Thu tiền mặt **6.497.000** (hiện đang là 2.527.000 — vốn đã là số ròng) (AC-28).
3. Chi tiền mặt **3.970.000** (không đổi).
4. TỔNG **+2.527.000**, không còn −943.000 — khớp tuyệt đối Sổ quỹ tiền mặt (AC-28).
5. Dòng "Điểm" vẫn hiện **500.000** như một hình thức tất toán, nhưng **không** cộng vào TỔNG (AC-29).
6. Mở drill-down "Thu tiền mặt" và "Chi tiền mặt" → tổng các dòng khớp màn hình tổng hợp, không khoản
   hoàn nào xuất hiện ở cả hai phía (AC-30).
7. Hàng bán 6.300.000, Hàng trả 2.590.000, số lượng hoá đơn 8 — **giữ nguyên** (AC-31).

## In scope

- Đọc `invoice_checkout_promotions` + `invoices.discount_amount` (D7.1).
- Bỏ vòng trừ hai lần ở cả handler tổng hợp và handler drill-down (D7.2).
- Bỏ `revenue.points` khỏi `revenue.total`, giữ field hiển thị (D7.3, ADR-04).

## Not in scope

- `promoCodeCount` — hằng số 0, cần định nghĩa nghiệp vụ trước (**A-03**).
- `netCashFlow` trộn card/bank/voucher (#10c) — đổi ngữ nghĩa cả báo cáo, để riêng.
- Chuyển báo cáo sang đọc `cash_movements` như `CashLedgerService` — kiến trúc đúng về lâu dài nhưng
  vượt xa phạm vi vá lỗi; dùng làm chuẩn đối chiếu.
- Các báo cáo khác trong `invoice-report/`, `profit-report/`, `debt-report/` cũng đọc
  `invoice_promotions` — cùng lỗi nhưng QA không báo, ghi nhận để làm riêng.

## Definition of done

- [ ] AC-27…AC-31 pass
- [ ] TỔNG của báo cáo khớp **tuyệt đối** với Sổ quỹ tiền mặt cùng kỳ
- [ ] Không khoản hoàn nào bị đếm hai lần ở cả tổng hợp lẫn drill-down
- [ ] Các số QA xác nhận đang đúng (Hàng bán, Hàng trả, số hoá đơn) không đổi
- [ ] UI làm rõ dòng "Điểm" là thông tin, không cộng vào TỔNG (ADR-04)
- [ ] Demoed và accepted at gate G4
