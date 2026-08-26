---
feature: quick-exchange-line-discount
slug: quick-exchange-line-discount
owner: Akenzy
created: 2026-08-26
status: done            # draft | approved | in_construction | done | abandoned
---

# Intent — KM theo dòng trên đơn đổi trả nhanh

## Problem

Thu ngân không tất toán được đơn "đổi trả nhanh" khi dòng hàng có khuyến mại/giảm giá
theo dòng. Màn POS hiển thị đúng số phải thu, bấm Thanh toán thì BE trả HTTP 400:

> Ghi phần chênh đổi hàng vào công nợ yêu cầu invoice có customerId

Ca thật (ảnh chụp 26/08/2026 20:03, chi nhánh MT211 Đà Nẵng, khách lẻ "0793258856-chị nga"):

| Chiều    | Hàng hoá      | SL  | Đơn giá | KM dòng                  | Thành tiền |
| -------- | ------------- | --- | ------- | ------------------------ | ---------- |
| Trả      | TH9864-K-37   | −1  | 460.000 | —                        | 460.000    |
| Mua thêm | AK29011-XA-36 | 1   | 685.000 | 30% (205.500) — `sale30` | 479.500    |

Màn hình: **Còn phải thu 19.500**, thu ngân nhận 19.500 tiền mặt. BE lại tính phần chênh
là **225.000** (= 685.000 − 460.000, tức bỏ mất KM 205.500), thấy tiền thu 19.500 < 225.000
nên coi 205.500 là công nợ, mà khách lẻ không có `customerId` ⇒ chặn.

Hậu quả dây chuyền, đã xảy ra thật với hoá đơn `2608260051`:

1. `POST /invoices/exchanges` đã kịp tạo phiếu nháp EXCHANGE (ghi `net_amount = 225.000`)
   trước khi bước tất toán lỗi ⇒ phiếu nháp mồ côi nằm lại trong DB.
2. Phiếu nháp đó hiện trong dialog "Hóa đơn chưa thanh toán" (danh sách không lọc `type`),
   thu ngân mở lại thì nó bị khôi phục thành **tab bán hàng thường** — dòng hàng trả bị
   dồn vào giỏ mua vì mapper bỏ qua `direction`.
3. Thu ngân xoá dòng hàng trả rồi thanh toán ⇒ `PATCH /invoices/:id` xoá sạch dòng cũ,
   `POST /invoices/:id/checkout` (luồng bán thường, không kiểm `type`) phát hành một hoá đơn
   `type=EXCHANGE` với `amount_due = total_paid = 479.500` nhưng `net_amount = 225.000` mồ côi.
   Ba lưới hoá đơn POS và các báo cáo doanh thu đọc `net_amount` cho EXCHANGE ⇒ phiếu này
   vào báo cáo là 225.000 trong khi khách trả 479.500.

## Affected personas

| Persona           | Current behaviour                                                                           | Desired behaviour                                                             |
| ----------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Thu ngân POS      | Đơn đổi trả nhanh có KM dòng báo lỗi 400, phải bỏ giỏ hoặc lách bằng cách xoá dòng hàng trả | Thanh toán được ngay với khách lẻ, thu đúng phần chênh hiển thị trên màn hình |
| Kế toán / quản lý | Báo cáo doanh thu lệch ở những phiếu đổi trả bị lách, không có dấu hiệu nào để phát hiện    | Số trên báo cáo bằng số thu ngân thực thu                                     |

## Success signal

Đơn đổi trả nhanh có KM theo dòng, khách lẻ (không `customerId`), tất toán thành công và
`invoices.net_amount` bằng đúng số "Còn phải thu" POS hiển thị (19.500 ở ca trên) — không
còn phiếu `type=EXCHANGE` nào phát hành qua luồng `/checkout` bán thường.

## Out of scope

- **Sửa dữ liệu hoá đơn đã hỏng** (`2608260051` và các phiếu tương tự) — quyết định giữ
  nguyên chứng từ đã phát hành; chỉ chặn phát sinh mới.
- **CTKM tự động (promotion engine)** cho đơn đổi/trả — hiện chỉ luồng SALE chạy
  `evaluate-promotion`; phạm vi ở đây là KM **thủ công theo dòng** thu ngân tự nhập.
- **Cơ sở hoàn tiền của đơn đổi trả theo hoá đơn gốc (regular mode)** — đã có
  `refundableUnitValues` prorate theo hoá đơn gốc, không đụng tới.
- **Gộp/di trú `net_amount` sang một công thức khác** — giữ nguyên định nghĩa
  `netAmount = newSubtotal − returnedNet`.

## Constraints

| Kind         | Detail                                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production   | Lỗi đang chặn thu ngân tại quầy — phải sửa được mà không cần migration DB                                                                                                                    |
| Bất biến     | Chứng từ đã post là bất biến; không ghi đè `net_amount` của hoá đơn cũ                                                                                                                       |
| Hợp đồng API | `CreateInvoiceItemDto` đã có sẵn `lineDiscountType/Value/Reason`; `ReturnInvoiceLineDto` thì chưa — thêm field mới phải `@IsOptional()` để client cũ không vỡ (`forbidNonWhitelisted: true`) |
| Sinh mã      | Đổi DTO ⇒ phải chạy lại `pnpm openapi:generate` và commit `schema.ts` + snapshot                                                                                                             |

## Existing surface touched

- **Reused components:** `computeLineDiscount` (`invoice.service.ts:87`) — công thức KM dòng
  duy nhất của repo; `CartLineDiscount` ở pos-web; `CheckoutVariantEnum`.
- **Adjacent features:** `quick-exchange-single-invoice` (dựng luồng 1 chứng từ),
  `pos-promotion-apply` (KM tự động luồng SALE), `return-debt-refund-split`
  (ma trận hoàn tiền của `checkout-return`).
- **Entry points:** không thêm route mới — sửa trong màn `CheckoutPage` (POS) và
  các endpoint `POST /invoices/exchanges`, `POST /invoices/returns`, `POST /invoices/:id/checkout`.
