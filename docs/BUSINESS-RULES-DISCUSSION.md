# Business Rules — Cần Discussion với Tech Lead

> Tài liệu này liệt kê các **quyết định nghiệp vụ còn mơ hồ hoặc chưa được xác nhận** trong EPIC-007.
> Mỗi mục đều có: bối cảnh, các lựa chọn khả thi, và rủi ro nếu không quyết định sớm.
> **Không phải bug** — đây là những điểm cần alignment giữa dev và business trước khi ship.

---

## 1. Hủy hóa đơn đã thanh toán (Invoice Cancellation)

**Bối cảnh:**
Enum `InvoiceStatus` có `CANCELLED` nhưng không có endpoint hay flow nào thực hiện hủy hóa đơn đã `paid` hoặc `debt`.

**Câu hỏi cần xác nhận:**
- Hóa đơn đã thanh toán có được hủy không? Hay chỉ tạo hóa đơn hoàn trả (return)?
- Nếu hủy được: ai có quyền hủy (chỉ manager)?
- Khi hủy, hệ thống có tự động:
  - Nhập lại kho (reverse stock movement)?
  - Tạo journal reverse entry?
  - Đóng `invoice_debt` nếu là bán nợ?
  - Hoàn điểm membership nếu đã tích?

**Rủi ro nếu không quyết định:**
Nhân viên sẽ không có cách sửa sai hóa đơn đã in. Dữ liệu kế toán và kho sẽ không khớp thực tế.

---

## 2. Hóa đơn hoàn trả (Return / Refund Flow)

**Bối cảnh:**
Flow POS cũ (`SaleEntity`) có đầy đủ `ReturnEntity` + `ReturnLineEntity`. `InvoiceEntity` (flow mới) **không có return flow**.

**Câu hỏi cần xác nhận:**
- Return Invoice có cần tạo một hóa đơn mới với số âm (credit note) hay chỉ cập nhật trạng thái?
- Hàng hoàn trả có nhập lại kho không? Hay ghi vào location riêng (e.g., kho hàng lỗi)?
- Hoàn tiền: cash hay credit cho lần mua sau?
- Nếu invoice có khuyến mãi: hoàn tiền tính trên giá gốc hay giá sau discount?
- Điểm membership đã tích từ hóa đơn đó có bị trừ lại không?

**Rủi ro nếu không quyết định:**
Không có return flow = cashier phải xử lý thủ công ngoài hệ thống. Kho và kế toán lệch.

---

## 3. Tích điểm thành viên — Khi nào và bao nhiêu?

**Bối cảnh:**
`MembershipCardService.adjustPoints()` tồn tại nhưng `CheckoutInvoiceService` không gọi nó. Điểm hoàn toàn được nhập thủ công.

**Câu hỏi cần xác nhận:**
- Điểm được tích dựa trên `amountDue` (sau discount) hay `subtotal` (trước discount)?
- Tỷ lệ tích điểm là bao nhiêu? (ví dụ: 1 điểm / 1000 VND)
- Tỷ lệ có thay đổi theo `tier` (gold tích nhiều hơn silver)?
- Điểm có tích cho hóa đơn bán nợ (`status=debt`) không, hay chỉ tích khi `status=paid`?
- Nếu hóa đơn bị hủy / hoàn trả: điểm có bị thu hồi không?
- Điểm tích tự động ngay khi checkout hay cần approval của manager?

**Rủi ro nếu không quyết định:**
Loyalty program hoàn toàn không vận hành được — mọi điểm phải nhập tay. Khách hàng không tin tưởng hệ thống.

---

## 4. Chiết khấu — Tính trên giá nào khi stack nhiều ưu đãi?

**Bối cảnh:**
Hiện tại `promotion-apply.service.ts` tính `discountAmount` dựa trên `invoice.subtotal` (giá gốc), bất kể đã có promotion nào được áp dụng trước đó.

**Ví dụ cụ thể:**
```
subtotal = 1,000,000 VND
Áp dụng voucher 100,000 VND  → discountAmount = 100,000
Áp dụng discount code 10%    → 10% × 1,000,000 = 100,000 (tính trên subtotal gốc)

Tổng discount = 200,000 VND
amountDue = 800,000 VND
```

**Cách khác (tính trên giá sau discount trước):**
```
10% × (1,000,000 - 100,000) = 90,000
Tổng discount = 190,000 VND
amountDue = 810,000 VND
```

**Câu hỏi cần xác nhận:**
- Discount code % tính trên `subtotal` gốc hay `subtotal - discount đã có`?
- Có sự khác biệt giữa voucher và discount code trong cách tính không?
- Rule này có được ghi vào điều khoản chương trình khuyến mãi để khách hàng biết không?

**Rủi ro nếu không quyết định:**
Khiếu nại khách hàng khi số tiền giảm không đúng kỳ vọng. Kế toán khó reconcile.

---

## 5. Bán nợ — Payment Terms và Ngày đến hạn

**Bối cảnh:**
`InvoiceDebtEntity` có `dueDate` nhưng hiện tại luôn là `null` khi tạo debt. Không có cơ chế nào auto-set ngày đến hạn hay chuyển status sang `OVERDUE`.

**Câu hỏi cần xác nhận:**
- Payment terms mặc định là gì? (Net 7, Net 15, Net 30?)
- `dueDate` có khác nhau theo từng `CustomerGroup` không? (khách VIP được 30 ngày, thường 7 ngày)
- Khi quá hạn, hệ thống có:
  - Tự chuyển status → `OVERDUE`?
  - Gửi thông báo cho staff phụ trách?
  - Block bán nợ tiếp cho khách đó?
- Khách có tổng công nợ vượt hạn mức (credit limit) có bị block bán nợ không?
- Lãi suất phạt quá hạn có không?

**Rủi ro nếu không quyết định:**
Debt aging report sẽ không chính xác. Không biết khoản nào đang quá hạn. Thu nợ hoàn toàn thủ công.

---

## 6. Journal Kế Toán — Account mapping cho từng phương thức thanh toán

**Bối cảnh:**
Hiện tại `CheckoutInvoiceDto` yêu cầu client gửi `cashAccountId` và `revenueAccountId`. Với `paymentMethod=debt`, code vẫn debit `cashAccountId` — điều này **sai về kế toán** (phải debit AR/Công nợ phải thu).

**Câu hỏi cần xác nhận:**
- Account mapping chuẩn cho từng payment method là gì?

  | Payment Method | Debit | Credit |
  |---|---|---|
  | `cash` | Tiền mặt (1111) | Doanh thu (511x) |
  | `bank_transfer` | Tiền gửi ngân hàng (1121) | Doanh thu (511x) |
  | `card` | Phải thu thẻ (131x) | Doanh thu (511x) |
  | `debt` | Phải thu khách hàng (131x) | Doanh thu (511x) |

- Account mapping có được cấu hình per-organization không, hay hardcode theo loại?
- Có cần tách `revenueAccountId` theo từng nhóm hàng/danh mục không?
- VAT account (thuế đầu ra) được xử lý riêng hay gộp vào revenue?

**Rủi ro nếu không quyết định:**
Báo cáo tài chính sai. Kiểm toán sẽ từ chối số liệu. Kế toán phải sửa thủ công hàng trăm entries.

---

## 7. Thuế VAT trong hóa đơn

**Bối cảnh:**
`InvoiceItemEntity` không có `taxAmount` hay `taxRate`. Flow POS cũ (`SaleLineEntity`) có `taxAmount`. Hóa đơn điện tử Việt Nam (Nghị định 123/2020/NĐ-CP) yêu cầu phải có thông tin thuế.

**Câu hỏi cần xác nhận:**
- Hệ thống có cần xuất hóa đơn VAT (hóa đơn đỏ) không?
- Thuế tính per-line hay trên tổng hóa đơn?
- Thuế suất có khác nhau theo sản phẩm không? (0%, 5%, 8%, 10%)
- Giá trong hệ thống là giá đã bao gồm VAT hay chưa (inclusive vs exclusive)?
- `amountDue` có bao gồm VAT không?

**Rủi ro nếu không quyết định:**
Không thể tích hợp hóa đơn điện tử (e-invoice). Vi phạm quy định thuế nếu bán cho doanh nghiệp.

---

## 8. Inventory Reservation trong Draft Lifecycle

**Bối cảnh:**
Khi cashier tạo draft invoice và thêm hàng vào giỏ, kho **không được giữ chỗ**. Trong lúc draft đang mở (có thể vài giờ), hàng có thể bị bán hết bởi invoice khác → checkout thất bại do insufficient stock.

**Câu hỏi cần xác nhận:**
- Có cần reservation không? (nhiều POS nhỏ không dùng reservation)
- Nếu có: reservation tự động expire sau bao lâu? (30 phút, 2 giờ?)
- Nếu không có reservation: UX khi checkout fail do hết hàng là gì? Cashier cần làm gì?
- Draft có TTL (tự động xóa sau X giờ) không?

**Rủi ro nếu không quyết định:**
Cashier phục vụ xong, đến lúc checkout mới biết hết hàng → trải nghiệm khách hàng tệ, đặc biệt với hàng tồn kho thấp.

---

## 9. Voucher Generic vs Voucher Cá Nhân

**Bối cảnh:**
`VoucherEntity.customerId` là nullable. Khi `customerId = null`, voucher có thể dùng cho bất kỳ khách nào. Nhưng `InvoiceEntity.customerId` cũng nullable (khách vãng lai — walk-in).

**Câu hỏi cần xác nhận:**
- Khách vãng lai (không có `customerId`) có được dùng voucher generic không?
- Khách vãng lai có được dùng voucher đã gán tên khách cụ thể không? (Câu trả lời rõ ràng là không, nhưng flow hiện tại validate `invoice.customerId` so với `voucher.customerId` — nếu invoice không có customer thì sẽ không validate được)
- Một voucher generic có giới hạn số lần dùng không? (`isUsed` chỉ là boolean, không phải counter)

**Rủi ro nếu không quyết định:**
Cashier có thể áp dụng voucher tên người khác cho khách vãng lai. Voucher marketing bị lạm dụng.

---

## 10. Stacking Rule — Tổng discount có bị cap không?

**Bối cảnh:**
Hiện tại `discountAmount` có thể vượt quá `subtotal` nếu nhiều promotions được stack. `amountDue` được tính bằng `Math.max(0, subtotal - totalDiscount - depositAmount)` — không âm, nhưng có thể = 0.

**Câu hỏi cần xác nhận:**
- Tổng discount có bị cap ở một mức tối đa không? (ví dụ: tối đa 50% subtotal)
- Discount từ voucher có được cộng với discount từ promotion không hay chỉ lấy mức cao hơn?
- Có loại item nào không áp dụng được khuyến mãi không? (hàng sale, hàng ký gửi)
- Nếu discount + voucher > subtotal, hệ thống có hoàn tiền mặt phần chênh lệch không?

**Rủi ro nếu không quyết định:**
Khách có thể stack promotions để mua miễn phí. Doanh thu âm trong báo cáo.

---

## 11. Điểm Membership và Discount — Dùng đồng thời được không?

**Bối cảnh:**
Hiện tại chưa có flow cho phép **đổi điểm** để giảm giá trực tiếp trên hóa đơn. `PointType.REDEEM` tồn tại nhưng không được tích hợp vào checkout.

**Câu hỏi cần xác nhận:**
- Điểm có thể đổi trực tiếp tại quầy thành tiền giảm giá không?
- Tỷ lệ đổi điểm là bao nhiêu? (100 điểm = 10,000 VND?)
- Dùng điểm + voucher + discount code có được đồng thời không?
- Điểm redeem có bị giới hạn tối đa X% của hóa đơn không?

**Rủi ro nếu không quyết định:**
Loyalty program thiếu use case cốt lõi. Điểm tích mà không xài được = khách không có động lực tham gia.

---

## 12. Credit Limit cho Bán Nợ

**Bối cảnh:**
Hiện tại không có giới hạn nào khi bán nợ. Một khách hàng có thể có vô số `invoice_debt` với tổng `remainingAmount` không giới hạn.

**Câu hỏi cần xác nhận:**
- Mỗi khách có credit limit không? Lưu ở đâu? (`CustomerEntity` hiện không có field này)
- Credit limit có khác nhau theo `CustomerGroup` không?
- Khi tổng `remainingAmount` vượt credit limit: block hoàn toàn hay chỉ cảnh báo?
- Manager có thể override credit limit không?
- Khách có nợ quá hạn (`OVERDUE`) có bị block tạo debt mới không?

**Rủi ro nếu không quyết định:**
Rủi ro nợ xấu không kiểm soát được. Một số khách có thể nợ số tiền lớn mà hệ thống không cảnh báo.

---

## Checklist Discussion

| # | Chủ đề | Người quyết định | Deadline | Status |
|---|---|---|---|---|
| 1 | Invoice cancellation flow | Tech Lead + Business | — | ⏳ Chưa |
| 2 | Return/Refund flow | Tech Lead + Business | — | ⏳ Chưa |
| 3 | Membership points — tỷ lệ và thời điểm tích | Business | — | ⏳ Chưa |
| 4 | Discount stacking — tính trên giá nào | Business + Tech Lead | — | ⏳ Chưa |
| 5 | Payment terms và overdue | Business | — | ⏳ Chưa |
| 6 | Journal account mapping per payment method | Kế toán + Tech Lead | — | ⏳ Chưa |
| 7 | VAT / thuế trong invoice | Business + Kế toán | — | ⏳ Chưa |
| 8 | Inventory reservation trong draft | Tech Lead | — | ⏳ Chưa |
| 9 | Voucher generic + walk-in customer | Business | — | ⏳ Chưa |
| 10 | Cap tổng discount | Business | — | ⏳ Chưa |
| 11 | Đổi điểm tại quầy | Business | — | ⏳ Chưa |
| 12 | Credit limit cho bán nợ | Business | — | ⏳ Chưa |
