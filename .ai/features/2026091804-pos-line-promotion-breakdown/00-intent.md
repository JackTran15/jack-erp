---
feature: pos-line-promotion-breakdown
slug: 2026091804-pos-line-promotion-breakdown
owner: Akenzy
created: 2026-09-18
status: draft
---

# Intent — POS: CTKM tự áp dụng hiện trên từng dòng hàng, cả màn hình lẫn hóa đơn

## Problem

Feature `2026091803` chứng minh engine chia đúng: giỏ `SKU-685` + `SKU-100` với
CTKM-A (hàng hóa 10%) và CTKM-B (hóa đơn 10%, `NON_PROMO_ONLY`) ra 68.500 trên
dòng 685.000 và 10.000 chỉ trên dòng 100.000. Nhưng thu ngân **không nhìn thấy
điều đó ở đâu trên màn hình bán hàng**:

- Dòng hàng vẫn in *685.000 / 685.000* — `InvoiceLineItemRow` chỉ vẽ giảm giá
  **tay** (`line.lineDiscount`): nhãn đỏ nghiêng dưới tên và cột *Thành tiền*
  gạch giá gốc, ghi giá sau. CTKM do engine áp (`appliedPrograms[].lineDiscounts`)
  không được vẽ, dù dữ liệu đã nằm sẵn trong preview.
- Panel phải gom mọi CTKM vào **một** dòng *Khuyến mại −78.500*; modal *Chương
  trình khuyến mãi* có tên nhưng không có số tiền.
- Hóa đơn in (`renderInvoiceHtml`) chỉ tách được *KM theo mặt hàng* / *KM theo
  hóa đơn* ở phần tổng; bảng hàng in đơn giá gốc, không nói dòng nào được CTKM
  nào giảm bao nhiêu. Khi in lại từ danh sách hóa đơn, API `GET /invoices/:id`
  chỉ trả `appliedPromotions[{type, discountAmount}]` — không có tên, không có
  phân bổ theo dòng, dù `invoice_checkout_promotions.line_discounts` đã lưu đủ.

Akenzy chốt cách hiển thị (ảnh mẫu 2026-09-18, dòng `ABA2777-N-42` đang có
giảm tay): **CTKM tự áp dụng hiển thị y hệt giảm giá tay** — dưới tên hàng là
nhãn đỏ nghiêng *tên CTKM + số tiền giảm*, cột *Thành tiền* gạch giá gốc và ghi
giá sau; nếu dòng vừa có giảm tay vừa có CTKM thì **cộng dồn** — hai nhãn, một
giá sau trừ cả hai. Hóa đơn in cũng phải mang cùng thông tin trên từng dòng.

## Affected personas

- **Thu ngân POS** — đối chiếu với khách "hàng này được giảm gì, còn bao nhiêu"
  ngay trên màn hình, không phải mở modal hay in tạm tính.
- **Khách hàng** — hóa đơn in cho thấy từng món được chương trình nào giảm.
- **Kế toán / quản lý** — in lại hóa đơn cũ vẫn thấy đúng phân bổ đã lưu, không
  phải tính lại.

## Success signal

1. Giỏ `SKU-685` + `SKU-100` với CTKM-A/CTKM-B: dòng 1 có nhãn *CTKM-A … (68.500)*
   và *Thành tiền* ~~685.000~~ **616.500**; dòng 2 có nhãn *CTKM-B … (10.000)* và
   ~~100.000~~ **90.000**; *Còn phải thu* vẫn **706.500** — không đổi số học.
2. Thêm giảm tay 50.000 vào dòng 1 → hai nhãn dưới tên, *Thành tiền* trừ cả
   hai; *Còn phải thu* khớp với `evaluate` (engine đã trừ giảm tay trước khi
   tính %).
3. *In tạm tính* và hóa đơn in sau *Thu tiền* mang nhãn CTKM dưới từng dòng và
   `lineTotal` sau CTKM; phần tổng *KM theo mặt hàng / KM theo hóa đơn* giữ
   nguyên.
4. In lại hóa đơn `2609180003` từ danh sách HĐ cho ra cùng nhãn và cùng số —
   đọc từ snapshot đã lưu, không gọi lại engine.
5. Không test promotion/checkout nào đang xanh chuyển đỏ; `pnpm openapi:generate`
   không đổi gì ngoài field mới.

## Out of scope

- Thay đổi cách engine tính hay phân bổ (`lineDiscounts` là đầu vào, không đụng).
- Số tiền từng chương trình trong modal *Chương trình khuyến mãi* và tách dòng
  *Khuyến mại* ở panel phải — có thể là feature sau; ở đây chỉ dòng hàng + hóa đơn.
- Quà tặng (`GIFT_ITEM`, `gifts[]`) — đã có dòng riêng giá 0, không phải một
  khoản giảm.
- `modules/mobile` và backoffice-web (màn chi tiết hóa đơn backoffice) — chỉ POS.
- Phiếu trả / đổi hàng (`isReturnCredit`, quick-exchange): dòng trả đã có
  `promotionDiscount` riêng, không vẽ thêm.

## Constraints

- POS/backoffice không có test runner (`"test": "echo test"`) — hành vi UI chứng
  minh bằng ảnh headless (`capture-pos-evidence.py` của feature 2026091803 mở
  rộng), số assert từ DOM.
- Hóa đơn in lại phải đọc **snapshot** (`invoice_checkout_promotions`) — hóa đơn
  đã post là bất biến, không được đánh giá lại CTKM tại thời điểm in.
- `lineId` của preview là id dòng phía client (echo từ `evaluate`); `lineId`
  trong snapshot là `invoice_items.id`. Hai ánh xạ khác nhau, không dùng chung.
- API: thêm field vào `AppliedInvoicePromotionDto` là mở rộng, không đổi nghĩa
  field cũ (`groupPromotionsForPrint` vẫn chạy). Sau đó `pnpm openapi:generate`.
- Tiếng Việt cho mọi chuỗi UI; số qua `formatVnd`.

## Existing surface touched

- `apps/pos-web/src/components/page-components/Checkout/CheckoutLeftPane/InvoiceLineItemTable/InvoiceLineItemRow/InvoiceLineItemRow.tsx` — nhãn + cột Thành tiền
- `apps/pos-web/src/lib/page-libs/checkout/checkoutUtils.ts` — `formatDiscountLabel`, `lineTotal`
- `apps/pos-web/src/lib/page-libs/checkout/checkoutReceiptFactory.ts`, `printing/renderInvoiceHtml.ts`, `interfaces/invoice-printing.interface.ts` — dòng hóa đơn in
- `apps/pos-web/src/lib/page-libs/invoice-list/invoiceRowPrintPayload.ts`, `interfaces/invoice.interface.ts` — in lại
- `apps/api/src/modules/pos/dto/draft-invoice.response.dto.ts`, `services/invoice.service.ts` — `appliedPromotions` mang tên + `lineDiscounts`
- `packages/api-client` (generated), `openapi.snapshot.json`
