---
id: UOW-08
slug: print-promotion-breakdown
title: Hóa đơn in (vừa thanh toán + in lại) hiện đúng KM theo hóa đơn / theo mặt hàng
demoable: true
duration: 1.5d
depends_on: [UOW-01]
requirements: [US-09]
verifies: [AC-29, AC-30, AC-31, AC-32]
risk: medium
status: todo
rollback: để itemDiscountTotal/invoiceDiscountTotal undefined trở lại — renderInvoiceHtml.ts đã ẩn khối này khi null, không có gì cần dọn
---

# UOW-08 — Hóa đơn in hiện đúng chi tiết khuyến mại

Thêm 10/08/2026 sau phiên review bug QA. **Không phải build tính năng mới** —
`renderInvoiceHtml.ts` đã có sẵn markup đầy đủ cho khối "Khuyến mãi" / "KM theo mặt hàng" /
"KM theo hoá đơn", chỉ là chưa bao giờ được đổ số thật vào. Đây là UoW nối dây dữ liệu, tách
biệt hoàn toàn khỏi giảm giá tay của thu ngân (nhãn "Giảm giá" có sẵn — không gộp hai nguồn).

## Demo script

1. POS: thanh toán 1 hóa đơn có 1 CTKM `INVOICE_DISCOUNT` giảm 100.000 và 1 CTKM `ITEM_DISCOUNT`
   giảm 50.000 trên dòng khác
2. In ngay sau khi Thu tiền → thấy "Khuyến mãi -150.000" / "KM theo hoá đơn -100.000" /
   "KM theo mặt hàng -50.000", tách riêng khỏi dòng "Giảm giá" (nếu có giảm giá tay)
3. Mở lại hóa đơn đó từ Danh sách hóa đơn → In → breakdown giống hệt bước 2
4. Mở hóa đơn đó từ Lịch sử mua hàng của khách → In → breakdown giống hệt bước 2
5. Thanh toán 1 hóa đơn không có CTKM nào → in ra không có khối "Khuyến mãi" nào cả

## In scope

- Backend: expose `invoice_checkout_promotions` (đã ghi, chưa từng đọc) qua `GET /invoices/:id`
- Frontend: gom `appliedPrograms`/`appliedPromotions` theo `type` thành 2 dòng, nối vào cả 2
  payload builder (hóa đơn vừa thanh toán + in lại)

## Not in scope

- Dòng "Mã ưu đãi (voucher)" — `UOW-03-voucher-redeems` còn `todo`, chưa có số tiền voucher nào
  để nối vào
- Gộp giảm giá tay vào "KM theo mặt hàng" — quyết định giữ tách riêng (A-17)

## Risks

| Risk | Mitigation |
| --- | --- |
| Nhầm loại CTKM giữa "theo hoá đơn" và "theo mặt hàng" | Đã đọc cả 5 strategy file để xác nhận mapping: `INVOICE_DISCOUNT` → hoá đơn; `ITEM_DISCOUNT`/`TIERED_DISCOUNT`/`BUY_M_GET_N` → mặt hàng (đều phân bổ qua `lineDiscounts[]`); `GIFT_ITEM` loại khỏi cả 2 (luôn `discountAmount: 0`) |
| Preview (trước khi chốt) và snapshot đã ghi (sau khi chốt) lệch số nếu giỏ hàng đổi giữa lúc preview và lúc checkout | T-08-03 dùng đúng `promotionPreview.data` tại thời điểm `finalizeCheckoutAndPrint` chạy — cùng nguồn đã dùng cho panel tổng tiền, không phải số cũ hơn |

## Definition of done

- [ ] AC-29..AC-32 pass theo Demo script
- [ ] `pnpm --filter @erp/api test` / `test:e2e` xanh (T-08-01)
- [ ] `tsc --noEmit` của `pos-web` sạch
- [ ] Demoed và accepted ở gate G4
