---
feature: pos-line-promotion-breakdown
adrs: 5
---

# Logical design — POS: CTKM tự áp dụng hiện trên từng dòng hàng và hóa đơn

## Approach

Không đụng engine, không đụng saga, không đổi cách checkout gửi gì lên server.
Toàn bộ feature là **trình bày lại dữ liệu đã có**: lúc bán là
`EvaluateCartResponse.appliedPrograms[].lineDiscounts` (đã nằm trong
`promotionPreview` của tab), sau khi post là `invoice_checkout_promotions`
(đã lưu tên + `line_discounts`, chỉ chưa trả ra API).

Một hàm thuần làm trục cho mọi màn hình:

```
buildLinePromotionIndex(programs: AppliedProgramLike[]) → Map<lineId, LinePromotion[]>
  LinePromotion = { programId, code, name, type, discountAmount, unitPriceAfter,
                    bucket: "item" | "invoice" }
  bucket = type ∈ {ITEM_DISCOUNT, TIERED_DISCOUNT, BUY_M_GET_N} ? "item" : "invoice"
  GIFT_ITEM bị bỏ (discountAmount = 0; quà có dòng riêng)
```

`AppliedProgramLike` là giao của hai nguồn: `AppliedProgram` (preview) và
`AppliedInvoicePromotionDto` mở rộng (snapshot). Cùng một index, hai `lineId`
khác nhau: preview khớp `CartLine.lineId`, snapshot khớp `invoice_items.id`
(A-08, ràng buộc trong intent). Mọi chỗ vẽ chỉ hỏi index: *dòng này có những
CTKM nào, phần "item" cộng lại bao nhiêu*.

Từ index, ba nhóm màn hình:

1. **Màn hình bán hàng** (`InvoiceLineItemRow`, `PaymentSummaryBlock`):
   - Dưới tên: nhãn giảm tay (nếu có) rồi từng `LinePromotion` dạng
     `${name} (${formatVnd(discountAmount)})`, cùng class đỏ nghiêng.
   - *Thành tiền*: `lineTotal(line) − Σ item-bucket` — gạch `grossTotal` khi có
     bất kỳ khoản giảm nào (tay hoặc item). Invoice-bucket **không** trừ (A-01).
   - Panel: `Tổng tiền = selectGrandTotal − Σ item-bucket (toàn giỏ)`; dòng
     *Khuyến mại* = Σ invoice-bucket, ẩn khi = 0; *Còn phải thu* không đổi công
     thức (`deriveSettlement` vẫn trừ `promotionDiscount` toàn phần) — nên số
     cuối cùng y hệt hôm nay (AC-08/09).
   - ✕ trên dòng *Khuyến mại* chỉ đưa các program invoice-bucket vào
     `excludedProgramIds` (A-04).
2. **Hóa đơn in lúc bán** (`checkoutReceiptFactory` → `renderInvoiceHtml`):
   `InvoiceLineData` thêm `promotionLabels?: string[]`; `lineTotal` = net sau
   giảm tay + item-bucket; khối tổng giữ nguyên (A-05). Renderer in mỗi nhãn
   một `div.line-sub`.
3. **Hóa đơn đã lưu** (`GET /invoices/:id` → `InvoiceReceiptDialog`,
   `invoiceRowPrintPayload`): DTO trả thêm `programId`, `code`, `name`,
   `lineDiscounts[]` từ snapshot; hai nơi đọc dựng cùng index bằng
   `invoice_items.id`, vẽ như (1)/(2).

Hai selector mới trong `checkout-session.store.ts` gói việc gọi index cho tab
hiện tại: `selectLinePromotionIndex(state)` và
`selectPromotionBucketTotals(state) → { item, invoice }`. `useCheckoutGrandTotal`
không đổi; `PaymentSummaryBlock` đọc thêm bucket để hiển thị.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Server tính sẵn `unitPriceAfter`/nhãn vào `EvaluateCartResponse` cho POS | Response đã có đủ (`lineDiscounts` mang cả `unitPriceAfter`); thêm field chỉ để đỡ một `Map` phía client là chạm `modules/mobile` không cần thiết |
| Đổi `lineTotal()` trong `checkoutUtils.ts` để trừ luôn CTKM | Hàm đó là gốc của `selectGrandTotal`, draft payload, settlement, receipt — trừ CTKM ở đó là gửi số "đã giảm" lên server, vi phạm ADR-06 của checkout-saga (server tự tính lại, client không gửi số CTKM) |
| Lưu preview vào draft để *HĐ lưu tạm* cũng vẽ được | Draft server chưa qua engine; lưu số đã đánh giá là lưu một con số có thể cũ khi mở lại — ngoài phạm vi (A-07) |
| Gộp invoice-bucket vào *Thành tiền* dòng (gạch 100.000 → 90.000) | Trừ hai lần trên màn hình khi panel cũng hiện −10.000; Akenzy bác (A-01) |
| Đổi khối tổng hóa đơn in cho giống panel màn hình | Khối tổng in đã tách *KM theo mặt hàng* / *KM theo hóa đơn* và mô hình gross/net của giảm tay đang chạy; đổi thêm là scope creep (A-05) |

## Domain model

Không có entity mới, không migration. Kiểu mới chỉ ở tầng trình bày:

- `LinePromotion` (pos-web `interfaces/promotion.interface.ts`) — như trên.
- `AppliedInvoicePromotionDto` (API) mở rộng: `+ programId: string`, `+ code`,
  `+ name`, `+ lineDiscounts: { lineId; discountAmount; unitPriceAfter }[]`.
  `type`/`discountAmount` giữ nguyên tên và nghĩa.
- `InvoiceRow.appliedPromotions` (pos-web) mở rộng cùng shape.
- `InvoiceLineData.promotionLabels?: string[]` (in).

## Contracts

### GET /invoices/:id — `appliedPromotions[]`
```
{ programId, code, name, type, priority?, discountAmount,
  lineDiscounts: [{ lineId /* invoice_items.id */, discountAmount, unitPriceAfter }] }
```
`lineDiscounts` là `line_discounts` jsonb đọc nguyên, `null` → `[]`. Không đọc
`gifts` (không cần). Thứ tự phần tử: theo `priority` rồi `created_at` như bảng.

### POST /v2/promotions/evaluate — không đổi.

## State ownership

- Nguồn sự thật lúc bán: `promotionPreview.data` (server trả). Index chỉ là
  view dẫn xuất qua selector; không có state mới, không ghi ngược.
- Nguồn sự thật sau post: `invoice_checkout_promotions` — bất biến.
- `excludedProgramIds` (thu ngân bỏ CTKM) vẫn ở `CheckoutPromotionDraft`.

## Error taxonomy

| Tình huống | Hành vi |
| --- | --- |
| Preview `loading` | Dòng và panel giữ hiển thị **trước đó**? Không — dòng không có nhãn/gạch, panel hiện ô xám như hôm nay; không đoán số (AC-03 của pos-promotion-apply cũ) |
| Preview `unavailable` | Không nhãn, không gạch; panel hiện "Chưa tính được khuyến mại" như hôm nay; Thu tiền không bị chặn |
| `lineDiscounts[].lineId` không khớp dòng nào | Bỏ qua khoản đó ở dòng; **vẫn** cộng vào bucket tổng để panel không lệch với server; log `console.warn` một lần |
| Snapshot `line_discounts` null (hóa đơn cũ) | `lineDiscounts: []` → dialog/in lại không nhãn, `lineTotal` = như hiện nay |
| Snapshot có program mà `invoice_items` không còn dòng (đã xóa?) | Không thể — `invoice_items` bất biến sau post; nếu có, bỏ qua như trường hợp không khớp |
| `discountAmount` > `lineTotal` (dữ liệu hỏng) | `Math.max(0, …)` như `lineTotal()` đang làm với giảm tay |

Không có lỗi HTTP mới: DTO chỉ thêm field.

## Cache & offline

Không đổi. Preview vẫn theo debounce của `use-checkout-promotion-preview`;
`GET /invoices/:id` vẫn qua TanStack Query key `["invoice", id]`.

## Observability

`console.warn("[promotion] lineDiscount không khớp dòng", { programId, lineId })`
một lần mỗi program/lineId khi index gặp id lạ — đủ để nhìn thấy lệch giữa
preview và giỏ nếu xảy ra, không cần metric.

## ADRs

### ADR-01 — Index dòng ↔ CTKM là hàm thuần dùng chung cho preview và snapshot
**Context:** Ba màn hình (bán, in lúc bán, hóa đơn đã lưu) cần cùng câu trả lời
"dòng này được CTKM nào giảm bao nhiêu", từ hai nguồn có cùng shape nhưng
`lineId` khác hệ (id client vs `invoice_items.id`).
**Decision:** Một hàm `buildLinePromotionIndex(programs)` không biết nguồn là gì,
chỉ biết `lineDiscounts[].lineId`. Người gọi chịu trách nhiệm đưa đúng tập id.
Phân loại `item`/`invoice` nằm trong hàm này, là **chỗ duy nhất** giữ danh sách
loại (A-02).
**Consequences:** Thêm một loại CTKM mới phải cập nhật đúng một chỗ; ba màn hình
không thể lệch nhau về cách chia. Đổi lại, hàm phải được test bằng… không có test
runner ở pos-web (A-10) — nên logic giữ ở mức một `reduce`, và số được assert qua
ảnh DOM + e2e API.
**Status:** accepted

### ADR-02 — *Thành tiền* dòng chỉ trừ giảm tay + CTKM hàng hóa; CTKM hóa đơn chỉ là nhãn
**Context:** Akenzy muốn dòng hàng vẽ CTKM như giảm tay **và** dòng *Khuyến mại*
ở panel chỉ là CTKM hóa đơn. Nếu phần hóa đơn phân bổ xuống dòng cũng gạch giá
thì cùng 10.000 hiện hai lần và Σ *Thành tiền* ≠ *Tổng tiền*.
**Decision:** Invoice-bucket không đi vào *Thành tiền* và *Tổng tiền*; nó chỉ
xuất hiện dưới tên hàng (thông tin) và ở dòng *Khuyến mại*. Bất biến:
`Σ Thành tiền = Tổng tiền` và `Tổng tiền − Khuyến mại = Còn phải thu` (trước
điểm/cọc/phí). Akenzy chốt "A-01 ok" 2026-09-18.
**Consequences:** *Tổng tiền* đổi nghĩa (từ "sau giảm tay" thành "sau giảm tay
+ CTKM hàng hóa"); `deriveSettlement`/`selectGrandTotal` **không** đổi, chỉ số
hiển thị đổi — nên *Còn phải thu* và payload checkout giữ nguyên từng đồng.
**Status:** accepted

### ADR-03 — Không đụng `lineTotal()`/`selectGrandTotal`; số CTKM chỉ sống ở tầng hiển thị
**Context:** `lineTotal()` là gốc của draft payload, settlement và receipt.
checkout-saga ADR-06: server tự tính lại CTKM, client không gửi số CTKM lên.
**Decision:** Mọi phép trừ CTKM làm ở component/selector hiển thị
(`InvoiceLineItemRow`, `PaymentSummaryBlock`, factory in) — không sửa
`checkoutUtils.lineTotal`, không sửa `netSessionGrandTotal`.
**Consequences:** Có hai "tổng dòng" trong code (net tay vs net tay+CTKM); đặt
tên rõ (`displayLineTotal`) và comment trỏ về ADR này để không ai "gộp cho gọn".
**Status:** accepted

### ADR-04 — Mở rộng `AppliedInvoicePromotionDto` thay vì endpoint mới
**Context:** In lại/chi tiết cần tên + phân bổ dòng của snapshot. Có thể (a) thêm
field vào DTO có sẵn, (b) `GET /invoices/:id/promotions` riêng, (c) suy từ
`invoice_items.promotion_discount` (số, không tên).
**Decision:** (a). Bảng đã được đọc ở `invoice.service.ts:312`; chỉ là không map
hết cột. Additive, `groupPromotionsForPrint` vẫn nhận `{type, discountAmount}`.
**Consequences:** `pnpm openapi:generate` + commit `schema.ts`; `modules/mobile`
nếu dùng cùng DTO nhận thêm field và bỏ qua (A-11, kiểm bằng grep khi làm).
**Status:** accepted

### ADR-05 — ✕ trên dòng *Khuyến mại* chỉ loại CTKM hóa đơn
**Context:** Hôm nay ✕ đưa **mọi** `appliedPrograms` vào `excludedProgramIds`
(UOW-09 pos-promotion-apply). Sau ADR-02 dòng đó chỉ đại diện cho invoice-bucket.
**Decision:** ✕ chỉ loại các program invoice-bucket; hộp xác nhận chỉ nêu tên
chúng và số *Còn phải thu* sau khi bỏ (qua `previewExcluding` có sẵn). CTKM hàng
hóa bỏ trong modal như UOW-09 đã cho phép.
**Consequences:** Hành vi ✕ đổi so với hôm nay — ghi trong PR. Nếu Akenzy muốn
giữ "bỏ tất cả" (A-04 pending), đảo lại là một handler.
**Status:** accepted
