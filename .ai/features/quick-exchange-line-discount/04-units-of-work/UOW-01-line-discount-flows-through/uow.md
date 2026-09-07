---
id: UOW-01
slug: line-discount-flows-through
title: KM theo dòng chảy đúng từ giỏ POS xuống chứng từ đổi/trả
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05]
risk: medium
status: todo
rollback: revert 1 commit — không có migration, không có state DB mới; client cũ gửi thiếu KM chỉ quay lại hành vi gộp như hôm nay
---

# UOW-01 — KM theo dòng chảy đúng từ giỏ POS xuống chứng từ đổi/trả

## Demo script

1. Mở POS, tab đổi trả nhanh, **không chọn khách hàng**
2. Giỏ Trả hàng: quét TH9864-K-37, đơn giá 460.000
3. Giỏ Mua thêm: quét AK29011-XA-36 685.000, đặt KM 30% lý do `sale30` → dòng hiện 479.500
4. Panel phải hiển thị "Còn phải thu" 19.500 — nhập 19.500 tiền mặt, bấm Thanh toán (F9)
5. Hoá đơn in ra, không còn lỗi 400 về `customerId`
6. Mở Adminer: hàng `invoices` vừa tạo có `net_amount = 19.500`; dòng OUT có
   `line_total = 479.500`, `line_discount = 205.500`, `line_discount_type = percent`,
   `line_discount_value = 30`, `line_discount_reason = sale30`

## In scope

- Một công thức KM dòng duy nhất cho SALE / EXCHANGE / RETURN (`computeLineDiscount` tách ra util)
- `ReturnInvoiceLineDto` nhận `lineDiscountType/Value/Reason`
- `CreateExchangeInvoiceService` + `CreateReturnInvoiceService` tính và **lưu** KM cho cả dòng IN và OUT
- FE gửi bộ ba KM thay vì `lineDiscount: 0`, và tính `returnSubtotal`/`newSubtotal` trên số đã trừ KM

## Not in scope

- Khôi phục phiếu nháp đổi/trả (UOW-02)
- Guard `/checkout` (UOW-03)
- CTKM tự động của promotion engine cho đơn đổi/trả

## Risks

| Risk | Mitigation |
| --- | --- |
| Đổi `returnSubtotal` làm lệch số hoàn của mode regular (A-06) | AC-05 là regression guard chạy trước khi phát hành; `computeReturnedNet` vẫn ưu tiên `refundableUnitValues` khi có `originalInvoiceItemId` |
| Tách `computeLineDiscount` làm hồi quy luồng SALE | T-01-01 là refactor thuần, có unit test bọc trước khi đổi call-site |

## Definition of done

- [x] AC-01..AC-05 pass
- [x] `pnpm --filter @erp/api test` xanh
- [x] `pnpm openapi:generate` đã chạy, `schema.ts` + `openapi.snapshot.json` đã commit
- [x] Không có chuỗi tiếng Việt nào trong source backend
- [x] Demo ở trên chạy được trên máy dev
