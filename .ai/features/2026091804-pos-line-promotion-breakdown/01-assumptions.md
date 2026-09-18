---
feature: pos-line-promotion-breakdown
blocking_open: 0
---

# Assumption register

Một vòng hỏi 4 câu + một câu chốt trong chat (2026-09-18). Akenzy chốt: dòng hàng
hiện tên CTKM + số giảm + giá sau như giảm giá tay; dòng *Khuyến mại* ở panel phải
**chỉ** là khuyến mãi trên hóa đơn, không có thì ẩn. A-01 là chỗ hai câu trả lời
của Akenzy gặp nhau và cần một quy ước để số học còn khớp — đó là lý do nó blocking.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Phần giảm giá **hóa đơn** phân bổ xuống dòng (CTKM-B → 10.000 trên SKU-100) hiện dưới tên hàng **chỉ như nhãn**; cột *Thành tiền* của dòng **không** trừ nó. *Thành tiền* chỉ trừ giảm tay + CTKM **hàng hóa**. Nhờ vậy Σ *Thành tiền* = *Tổng tiền* (716.500) và *Tổng tiền* − *Khuyến mại (hóa đơn)* = *Còn phải thu* (706.500). Nếu dòng SKU-100 gạch 100.000 → 90.000 thì 10.000 bị trừ hai lần trên màn hình | high | yes | Nếu Akenzy muốn SKU-100 cũng gạch giá thì *Tổng tiền* phải đổi nghĩa lần nữa và dòng *Khuyến mại* panel thành thừa — đảo lại UOW-01 | confirmed | Akenzy chốt 2026-09-18 — "A-01 ok" sau khi xem mockup: SKU-100 chỉ nhãn, không gạch; Tổng tiền 716.500 / Khuyến mại −10.000 / Còn phải thu 706.500 |
| A-02 | "CTKM hàng hóa" = ba loại engine chạy ở pha giành dòng: `ITEM_DISCOUNT`, `TIERED_DISCOUNT`, `BUY_M_GET_N` (`LINE_CLAIMING_TYPES` trong `promotion-resolver.ts`). `GIFT_ITEM` luôn `discountAmount = 0`, quà đã có dòng riêng — không vẽ | high | no | Một loại xếp nhầm nhóm → số lệch giữa dòng và panel; sửa một hằng số | confirmed | Đọc `promotion-resolver.ts` (`LINE_CLAIMING_TYPES`, `GIFT_TYPES`) và `promotionPrintBuckets.ts` — hai nơi đã cùng chia như vậy |
| A-03 | Nhãn: `<tên CTKM> (<số giảm>)`, đỏ nghiêng cùng style nhãn giảm tay; thứ tự dưới tên: nhãn giảm tay (nếu có) trước, rồi từng CTKM theo thứ tự `appliedPrograms` trả về (đã sắp theo priority) | high | no | Chỉ là chuỗi hiển thị; đổi một hàm format | confirmed | Akenzy chọn "Tên CTKM (số giảm)" 2026-09-18; ảnh mẫu dòng `ABA2777-N-42` |
| A-04 | Nút ✕ trên dòng *Khuyến mại* (panel) từ nay chỉ loại các CTKM **hóa đơn** đang áp — vì dòng đó chỉ còn đại diện cho chúng. CTKM hàng hóa muốn bỏ thì vào modal *Chương trình khuyến mãi* (UOW-09 cũ đã cho tick/bỏ tick) | medium | no | Nếu Akenzy muốn ✕ vẫn "bỏ tất cả" như hiện nay: đổi một handler + câu xác nhận, không lan | pending | — |
| A-05 | Khối tổng của **hóa đơn in** giữ nguyên: *Tiền hàng* = tổng giá gốc, *Khuyến mãi* + *KM theo mặt hàng* / *KM theo hóa đơn* như hiện tại. Chỉ **dòng hàng** in đổi: nhãn CTKM dưới tên và `lineTotal` sau CTKM hàng hóa — đúng cách hóa đơn in đang xử lý giảm giá tay (dòng in net, *Tiền hàng* gross, *Giảm giá* một dòng riêng) | high | no | Nếu muốn khối tổng in giống panel màn hình: đổi thêm `renderInvoiceHtml` phần tổng — một ticket riêng | confirmed | `checkoutReceiptFactory.ts:222-240` và `renderInvoiceHtml.ts:140-160` — mô hình giảm tay có sẵn |
| A-06 | Hóa đơn đã post: in lại và panel chi tiết đọc **snapshot** `invoice_checkout_promotions` (tên + `line_discounts`) qua `GET /invoices/:id`, **không** gọi lại engine. Mở rộng `AppliedInvoicePromotionDto` thêm `programId`, `code`, `name`, `lineDiscounts[]` — additive, `groupPromotionsForPrint` không đổi | high | no | Nếu DTO không được mở rộng: chỉ có `invoice_items.promotion_discount` (số, không tên) — nhãn in lại thành "Khuyến mãi (x)" không tên | confirmed | `invoice.service.ts:312-319` đã đọc bảng này, chỉ cắt bớt field; entity có `line_discounts` jsonb |
| A-07 | "Panel chi tiết hóa đơn trong POS" = `InvoiceReceiptDialog` (danh sách HĐ + lịch sử mua của khách, dữ liệu `GET /invoices/:id`). `InvoiceDetailPanel` của *HĐ lưu tạm* hiện draft server (`GET /invoices/drafts`) — draft chưa qua engine, không có gì để vẽ, ngoài phạm vi | high | no | Nếu Akenzy muốn cả draft: phải lưu preview vào draft — một UoW khác | confirmed | `DraftInvoicesDialog.tsx:57`, `InvoiceListPage.tsx:88` |
| A-08 | Dữ liệu dòng lúc bán lấy từ `selectPromotionPreview(state).data.appliedPrograms[].lineDiscounts` — `lineId` là id dòng client, engine echo lại (`evaluateCartPayload.ts:12`). Không cần lưu thêm state; tab đổi giỏ thì preview tự đánh giá lại | high | no | Nếu `lineId` không khớp: nhãn không hiện — lộ ngay ở AC-01 | confirmed | `evaluateCartPayload.ts`, `LineDiscount.lineId` trong shared-interfaces |
| A-09 | Cộng dồn giảm tay + CTKM: UI chỉ trừ tiếp `discountAmount` engine trả — không tự tính % lại. **Sửa 2026-09-18 (T-01-02):** bản đầu ghi engine tính % trên phần *sau* giảm tay (63.500) — sai. `evaluate` thật với `manualLineDiscount: 50000`: CTKM-A vẫn **68.500** (10% của đơn giá gốc, `perUnitDiscount`), `subtotal` 735.000 (net giảm tay), `amountAfterPromotion` **656.500**. Ví dụ đúng: SKU-685 giảm tay 50.000 + CTKM-A → *Thành tiền* 566.500 | high | no | Nếu UI tự tính % → lệch với `Còn phải thu`; AC-04 bắt | confirmed | Chạy `POST /v2/promotions/evaluate` thật 2026-09-18 (xem T-01-02); AC-04/AC-13, demo UOW-01/02 đã sửa số theo |
| A-10 | Không wire test runner cho pos-web trong feature này (như A-17 feature 2026091803). Hành vi UI chứng minh bằng ảnh headless (`capture-pos-evidence.py` mở rộng, assert từ DOM); phần API bằng e2e Jest | high | no | Muốn vitest thật là feature riêng | confirmed | `apps/pos-web/package.json` `"test": "echo test"` |
| A-11 | `modules/mobile` và backoffice-web đọc `GET /invoices/:id` (nếu có) chỉ **thêm** field, không mất gì; không sửa hai app đó | medium | no | Nếu một client validate strict schema: 400 khi nhận field lạ — kiểm bằng `grep appliedPromotions` ngoài pos-web | pending | — |
| A-12 | Hóa đơn in không có gạch giá (HTML in hiện chỉ có `line-sub`); dòng in `lineTotal` sau CTKM hàng hóa + nhãn, không thêm gạch — giống giảm tay | high | no | Thuần trình bày | confirmed | `renderInvoiceHtml.ts:112-130` |

## Rejected assumptions

| ID | Assumption | Why rejected |
| --- | --- | --- |
| R-01 | Panel phải giữ nguyên (*Tổng tiền* 785.000 / *Khuyến mại* −78.500), chỉ thêm nhãn trên dòng | Akenzy 2026-09-18: "Khuyến mãi bên panel chỉ là khuyến mãi trên hóa đơn; không có thì không hiển thị" |
| R-02 | Dòng *Khuyến mại* panel gộp mọi loại CTKM như hiện nay | Cùng lý do R-01 |
