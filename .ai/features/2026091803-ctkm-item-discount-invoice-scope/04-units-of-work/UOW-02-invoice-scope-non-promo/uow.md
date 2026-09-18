---
id: UOW-02
slug: invoice-scope-non-promo
title: Giảm giá hóa đơn không cộng dồn lên hàng đã được giảm
demoable: true
duration: 2d
depends_on: []
requirements: [US-02]
verifies: [AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-22, AC-23]
risk: high
status: todo
rollback: trả `emptyForm.applyScope` về `ALL_ITEMS` và trả `invoiceDiscountToDto` về hardcode — CTKM đã lưu giữ nguyên giá trị, không cần migration ngược
---

# UOW-02 — Giảm giá hóa đơn không cộng dồn lên hàng đã được giảm

Đây là UoW mang rủi ro cao nhất của feature: nó đảo một quyết định đã ship
(ADR-01) và đổi cách tính tiền trên hóa đơn thật.

## Demo script
1. Backoffice → **Thêm mới → Giảm giá hàng hóa**: tạo *CTKM-A* giảm **10%** trên `SKU-685`
2. **Thêm mới → Giảm giá hóa đơn**: tạo *CTKM-B* giảm **10%**; ở mục **Phạm vi áp dụng** thấy radio 2 lựa chọn, **"Chỉ hàng hóa chưa áp dụng khuyến mại" đã chọn sẵn** → Lưu mà không đụng vào nó
3. Chạy `SELECT code, invoice_scope FROM promotion_programs ORDER BY created_at DESC LIMIT 1;` → `NON_PROMO_ONLY`
4. POS: giỏ gồm `SKU-685` (685.000) + `SKU-100` (100.000), tạm tính **785.000**
5. Kết quả đúng: CTKM-A giảm **68.500**, CTKM-B giảm **10.000** (10% của 100.000 — *không* phải 78.500), tổng giảm **78.500**, còn phải trả **706.500**
6. Mở CTKM cũ đang `ALL_ITEMS` → radio hiện đúng *Tất cả hàng hóa*, kèm dòng cảnh báo giải thích giảm chồng; đổi tên rồi Lưu → `SELECT` lại vẫn `ALL_ITEMS`

## In scope
- `CartState.discountFreeLines()` + nhánh `NON_PROMO_ONLY` của `InvoiceDiscountStrategy` mở rộng sang giảm tay (A-02)
- Khôi phục radio **Phạm vi áp dụng**, mặc định `NON_PROMO_ONLY` (ADR-01, ADR-03)
- Cảnh báo cho CTKM đang ở `ALL_ITEMS` (ADR-05)
- Bằng chứng trên DB thật cho cả đường ghi lẫn đường tính tiền

## Not in scope
- Backfill dữ liệu cũ (A-03) — chỉ cảnh báo, không sửa
- Đổi nghĩa `calc_basis = NON_PROMO_ITEMS` của `condition-evaluator` (ADR-02)
- Checkbox `accruePoints` (phần B của `promotion-scope-points-toggle`) — không đụng

## Risks
| Risk | Mitigation |
| --- | --- |
| Đảo ADR-01 tháng 8 mà lý do gốc của business chưa được ghi lại đầy đủ | ADR-01 của feature này ghi rõ supersede + ngày + người chốt; nếu sai thì rollback là 2 dòng, dữ liệu không đổi |
| Sửa `unclaimedLines()` nhầm sẽ đổi luôn cách đánh giá *điều kiện* CTKM | ADR-02: thêm hàm mới, không sửa hàm cũ; AC-21 canh hồi quy |
| Mặc định mới đè lên giá trị đang lưu của CTKM cũ khi có người mở ra sửa | ADR-03 đặt mặc định ở `emptyForm` chứ không ở mapper; AC-17 khóa bằng test đọc DB |
| `modules/mobile` dùng chung engine, có thể lệch mà không ai chạy thử | Nêu rõ trong T-02-01; AC-21 chạy lại toàn bộ suite promotion |

## Definition of done
- [x] AC-10..AC-20, AC-22, AC-23 có test phủ và xanh
- [x] **(trước khi merge, từ T-02-02)** Radio hiện 2 lựa chọn với "Chỉ hàng hóa chưa áp dụng khuyến mại" chọn sẵn trên màn hình thật — AC-22 ✅ 2026-09-18
- [x] **(trước khi merge, từ T-02-02)** Đổi lựa chọn rồi Lưu thì giá trị xuống DB đúng như đã chọn — AC-15 ✅ 2026-09-18
- [x] **(trước khi merge, từ T-02-02)** Mở CTKM đã lưu thì radio hiện đúng giá trị đang lưu, mặc định không đè — AC-17 ✅ 2026-09-18
- [x] `unclaimedLines()` không đổi chữ ký lẫn hành vi — có test riêng khẳng định nó vẫn giữ dòng giảm-tay
- [x] Engine vẫn thuần: không `@nestjs/*`, không `typeorm`, không `Date.now()`
- [x] CTKM `ALL_ITEMS` cũ được xác nhận **không đổi** cách tính (AC-16) — e2e đọc `invoice_scope` rồi assert 78.500 trên toàn bộ 785.000
- [x] ADR-01 nêu rõ supersede quyết định 2026-08-17, kèm ngày và người chốt
