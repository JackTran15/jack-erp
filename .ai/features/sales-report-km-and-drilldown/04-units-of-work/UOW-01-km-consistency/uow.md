---
id: UOW-01
slug: km-consistency
title: Cột Khuyến mại và Điểm KM khớp nhau trên cả bốn báo cáo bán hàng
demoable: true
duration: 2d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05]
risk: medium
status: todo
rollback: revert bốn commit của UoW; hai báo cáo theo hoá đơn quay lại đọc `invoices.discount_amount`, `revenue.promoPoints` quay lại `placeholder: 0`, `promoRate` quay lại `discount / goods`. Không migration, không backfill, không đổi schema — chỉ tầng đọc, nên revert là hoàn nguyên tuyệt đối.
---

# UOW-01 — Cột Khuyến mại và Điểm KM khớp nhau trên cả bốn báo cáo bán hàng

## Demo script
1. `make dev-api` + `make dev-backoffice`, đăng nhập backoffice, chọn chi nhánh **HCM**.
2. Mở `/reports/sales#daily_sales_summary`, đặt kỳ **01/08/2026 – 31/08/2026**, bấm "Lấy dữ liệu".
   → Dòng tổng cột **Khuyến mại** = `8.914.000` (trước feature: `9.214.000`).
   → Dòng **19/08/2026** cột Khuyến mại = `-300.000`.
   → Dòng tổng cột **Điểm KM** = `650.000`.
3. Đổi sang `#invoice_and_order_list`, cùng kỳ → dòng tổng Khuyến mại cũng `8.914.000`.
4. Đổi sang `#revenue_by_product`, cùng kỳ → dòng tổng Khuyến mại `8.914.000` (không đổi so với
   trước feature) và cột **Điểm KM** = `650.000` (trước feature: `0`).
5. Đổi sang `#revenue_detail_by_invoice_and_product`, cùng kỳ → tổng "Tiền KM" cũng `8.914.000`.
6. Trên bất kỳ báo cáo nào, lấy một dòng và kiểm `Tỷ lệ KM (%) = (Khuyến mại + Điểm KM) / Tiền hàng × 100`.
7. Đặt kỳ **01/08/2026 – 12/08/2026** (chỉ hoá đơn SALE, không có EXCHANGE nào) → cột Khuyến mại
   giữ nguyên từng đồng so với trước feature.

## In scope
- Helper dùng chung `loadSignedLineDiscounts` ở `report-core`.
- `daily-sales-summary` và `invoice-order-listing` lấy Khuyến mại từ helper thay vì header.
- `revenue.promoPoints` ở `revenue-by-item` và `invoice-item-revenue-detail` phân bổ từ
  `invoices.points_discount_amount` thay vì hard-code `0`.
- `promoRate` đổi tử số thành `discount + promoPoints` ở cả bốn báo cáo.
- Spec đối chiếu bốn báo cáo trên cùng một bộ dữ liệu.

## Not in scope
- Sửa checkout saga hay bất kỳ đường ghi nào — `invoices` bất biến sau phát hành (xem
  [[03-logical-design]] "Alternatives rejected").
- Backfill `invoices.discount_amount` cho hoá đơn EXCHANGE lịch sử.
- Báo cáo kho / công nợ / lợi nhuận, kể cả khi cũng có cột khuyến mại.
- Bất kỳ thay đổi frontend nào — UOW-02 và UOW-03 lo phần đó.

## Risks
| Risk | Mitigation |
|---|---|
| Nhân hai lần dấu: `direction` đã mang dấu (RETURN toàn dòng `IN`) nhưng code hiện có nhân sẵn `invoiceTypeSign` vào `discountAmount` — quên bỏ đi là RETURN đổi dấu hai lần và không ai thấy vì bộ dữ liệu hiện có KM = 0 trên mọi hoá đơn RETURN | T-01-02 bắt buộc có spec dựng một hoá đơn RETURN **có** khuyến mại (dữ liệu tổng hợp, không phụ thuộc seed) và khẳng định kết quả âm đúng một lần |
| `daily-sales-summary` cố tình không chạm `invoice_items`; thêm cột KM có thể biến nó thành báo cáo nạp cả tháng dòng hàng | T-01-01 là truy vấn `SUM … GROUP BY invoice_id`, trả `Map`, không nạp entity. Done-when của T-01-02 cấm `find`/`getMany` trên `invoice_items` |
| Phân bổ Điểm KM làm tròn lệch khiến Σ theo dòng ≠ số trên header, kế toán soi ra ngay | ADR-04 chốt dồn phần dư vào dòng cuối; T-01-03 có spec khẳng định Σ dòng = số header với số lẻ chia 3 |
| Kỳ tham chiếu chỉ có 2 hoá đơn EXCHANGE lệch — dễ "pass" nhầm vì số nhỏ | AC-01 neo vào giá trị âm 300.000 ở đúng ngày 19/08, không neo vào tổng |

## Definition of done
- [x] AC-01, AC-02, AC-03, AC-04, AC-05 đều pass
- [x] `pnpm --filter @erp/api test -- invoice-report` xanh — 215 test, cùng `report-core` là 382/382
- [x] Bốn báo cáo cho cùng Σ Khuyến mại và cùng Σ Điểm KM trên kỳ tham chiếu
- [x] `daily-sales-summary` vẫn không nạp entity `invoice_items` — chỉ gọi `loadSignedLineDiscounts` (một truy vấn `SUM … GROUP BY`)
- [x] Demoed và accepted ở gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` xanh trên mọi môi trường bắt buộc — local-backoffice, 12/12 bước
- [x] Có bằng chứng cho mọi AC trong `verifies` ở mọi viewport khai báo — AC-01 (S1, S2, S6), AC-02 (S1, S3, S4), AC-03 (S1, S4), AC-04 (S2), AC-05 (S12)
- [x] `08-evidence.md` đã sinh lại và sha của nó khớp HEAD
