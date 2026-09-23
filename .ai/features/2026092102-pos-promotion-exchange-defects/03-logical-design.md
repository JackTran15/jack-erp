---
feature: pos-promotion-exchange-defects
adr_count: 5
---

# Logical design — POS: CTKM trong modal, trên dòng trả và trên phần mua thêm của phiếu đổi

## Approach

Ba lỗi, ba lát cắt độc lập về mã nhưng cùng một nguyên tắc: **engine và snapshot
đã có đủ dữ liệu — việc còn lại là đưa nó tới đúng chỗ, và làm phiếu đổi đi
cùng đường với hóa đơn bán thay vì đường riêng.**

**(1) Modal — mở rộng contract evaluate.** `SkippedProgram` thêm `type`; cả
`AppliedProgram`/`AvailableProgram`/`SkippedProgram` thêm `description?`, lấy
thẳng từ `PromotionProgram.description` trong `PromotionResolver` (7 chỗ
`skipped.push` + `toAppliedProgram` + map `availablePrograms`). Domain model
`evaluation.ts` và `@erp/shared-interfaces` đổi song song (additive).
`mapEvaluateResponseToPromotionItems` bỏ `kindLabel: "—"` ở nhóm skipped, dùng
`PROGRAM_TYPE_LABELS[type]` cho cả ba nhóm và chép `description` qua
`PromotionItem.description` (`PromotionRow` đã in `?? "—"`).

**(2) Dòng trả — snapshot HĐ gốc đi qua `eligible-returns`.**
`ReturnEligibilityService.getEligibleLines` đọc thêm
`invoice_checkout_promotions` của HĐ gốc (repo đã có ở `invoice.service.ts`),
dựng `Map<invoice_items.id, EligibleLinePromotion[]>` với
`unitDiscount = round2(lineDiscount.discountAmount / quantity)` và gắn
`promotions[]` lên mỗi `EligibleLine`. POS: `ReturnableItem.promotions` →
`CartLine.returnPromotions` (qua `buildInvoiceReturnCartLines`) →
`InvoiceLineItemRow` vẽ `formatPromotionLabel({ name, discountAmount:
unitDiscount × qty })` dưới tên, cùng class với nhãn dòng bán. **Regression:**
bỏ kẹp `Math.max(0, …)` cho dòng trả ở `InvoiceLineItemRow.displayLineTotal` và
ở `PaymentSummaryBlock.total` — số âm là số đúng của phiếu trả (ADR-04).

**(3) Mua thêm — phiếu đổi đi cùng đường CTKM với hóa đơn bán.**
- BE: `CheckoutReturnService.checkout` dispatch `EvaluateCartQuery` trên dòng
  **OUT** (preflight, trước transaction, cùng tư thế `evaluate-promotion.step.ts`),
  với `lineId = invoice_items.id`, `manualLineDiscount = lineDiscount`,
  `customerId`, `selectedProgramIds`/`excludedProgramIds` từ `CheckoutReturnDto`.
  `ComputedTotals` thêm `newPromotionDiscount`, `newNet = newSubtotal −
  newPromotionDiscount`; `netAmount = newNet − returnedNet`; `refundedAmount =
  max(returnedNet − newNet, 0)`; `pointsEarned` và loyalty award trên `newNet`
  (A-02); `invoice.discountAmount = newPromotionDiscount` (A-07). Trong
  transaction: ghi `promotionDiscount` lên dòng OUT + snapshot
  `invoice_checkout_promotions` bằng helper **dùng chung** với
  `persist-invoice.step.ts` (ADR-02). `lineTotal` không đổi.
- FE: `useCheckoutPromotionPreview` bỏ điều kiện `isSale`; dòng gửi evaluate =
  `selectPurchaseCart` lọc `!isReturnCredit` (INVOICE_RETURN) hoặc
  `selectPurchaseCart` nguyên (QUICK_EXCHANGE, returnCart tách riêng).
  `buildEvaluateCartLines` gửi `manualLineDiscount = lineDiscountAmount(line)`
  cho cả hai kiểu giảm tay (A-10). Nhãn trên dòng mua thêm, *Tổng tiền*, *Còn
  phải thu* và bản in đã đọc `promotionIndex`/`selectPromotionDiscountAmount`
  không phân biệt variant nên tự đúng khi preview có dữ liệu.
- **Chốt số lúc Thanh toán (ADR-03/05):** `use-checkout-actions` nhánh đổi/trả
  tạo phiếu (`POST /invoices/exchanges|returns`) → gọi `POST
  /invoices/:id/checkout-return/preview` (dry-run: cùng load → evaluate →
  `computeTotals` của `checkout()`, không ghi) với `selectedProgramIds`/
  `excludedProgramIds` → dựng `buildCheckoutReturnPayload` từ
  `preview.netAmount`/`refundedAmount` (chiều tiền + trần `Σpayments`), rồi
  `POST checkout-return` với cùng hai mảng id. FE không còn công thức chiều tiền
  riêng; preview `/v2/promotions/evaluate` của POS chỉ phục vụ hiển thị và có
  hỏng cũng không chặn thu ngân (A-09 rejected).

## Alternatives rejected

| Option | Why not |
|---|---|
| Đưa phiếu đổi vào `checkout-saga` để tái dùng nguyên `EvaluatePromotionStep` + `PersistInvoiceStep` | Saga có 22 step gắn với hóa đơn bán (deposit, voucher, clamp-points, deduct-stock…); phiếu đổi có ma trận hoàn tiền/cấn nợ riêng. Chuyển luồng là dự án khác; ở đây chỉ cần 1 query + 1 helper ghi |
| Evaluate ở `POST /invoices/exchanges` (lúc tạo draft) và lưu số vào draft, `checkout-return` đọc lại | Số CTKM đông cứng giữa tạo và post (chương trình đổi giờ/ngừng); luồng bán cũng đánh giá ở preflight của checkout, không phải lúc tạo draft. Và đổi trả nhanh + theo HĐ đều tạo draft rồi post ngay trong cùng một click nên không được lợi gì |
| FE chặn *Thanh toán* khi preview CTKM chưa sẵn sàng ở tab đổi trả có dòng mua thêm | Akenzy từ chối 2026-09-21 (A-09): thu ngân phải thanh toán được kể cả khi evaluate của POS hỏng. Số phải là số BE |
| BE trả `netAmount` dự kiến ngay trong response `POST /invoices/exchanges` | `CreateExchangeInvoiceService` và `CheckoutReturnService` là hai service; phải tách `computeTotals`/`computeReturnedNet`/evaluate thành service chung để hai chỗ không lệch — refactor lớn hơn và vẫn evaluate hai lần. Dry-run trên chính `CheckoutReturnService` dùng **đúng** code path của post nên bằng nhau theo cấu trúc, không theo kỷ luật |
| FE tự tính `net = (newSubtotal − preview.promotionDiscount) − Σ refundable×qty` để chọn chiều tiền (bản đầu của ADR-03) | Vẫn là hai công thức ở hai nơi; hỏng ngay khi preview POS `unavailable` (đúng ca A-09). Thay bằng số BE từ dry-run |
| BE nới `Σpayments > netAmount` thành tiền thừa trả khách | Đổi mô hình tiền của phiếu đổi (không có khái niệm tiền thừa); che giấu lệch số giữa FE và BE thay vì loại bỏ nó |
| POS gọi thêm `GET /invoices/:id` rồi `buildLinePromotionIndex` để lấy nhãn dòng trả | Hai lời gọi cho một dialog; phép chia `discountAmount / quantity` và làm tròn bị lặp ở client trong khi `refundableUnitPrice` đã được tính server-side cùng chỗ. `EligibleLine` là nơi đã trả lời "một đơn vị đáng bao nhiêu", nên trả luôn "vì CTKM nào" |
| Modal tra `description` qua `POST /v2/promotions/search` riêng | Thêm một request mỗi lần mở modal và cần `promotion.read` — POS chỉ có `pos.promotion.evaluate` (xem comment ở `promotion-v2.controller.ts:48`) |
| Chép 2 hàm `persistLinePromotionDiscounts`/`persistPromotionSnapshot` vào `CheckoutReturnService` | Hai bản ghi snapshot lệch nhau là đúng loại lỗi khó thấy nhất; helper dùng chung là ~40 dòng, saga step chỉ đổi 2 lời gọi |

## Domain model

| Entity / type | Fields | Notes |
| --- | --- | --- |
| `SkippedProgram` (domain + shared) | `+ type: PromotionProgramType`, `+ description?: string` | additive |
| `AppliedProgram`, `AvailableProgram` (domain + shared) | `+ description?: string` | additive |
| `EligibleLinePromotion` (API, mới) | `programId, code, name, type, unitDiscount` | `unitDiscount = round2(discountAmount / quantity)` của dòng gốc |
| `EligibleLine` | `+ promotions: EligibleLinePromotion[]` | `[]` khi không snapshot |
| `ComputedTotals` (CheckoutReturnService) | `+ newPromotionDiscount: number`, `+ newNet: number` | `netAmount`/`refundedAmount`/points đọc `newNet` |
| `CheckoutReturnDto` | `+ selectedProgramIds?: string[]`, `+ excludedProgramIds?: string[]` | cùng validator `CheckoutV2Dto` |
| `CheckoutReturnPreviewDto` (API, mới) | `selectedProgramIds?`, `excludedProgramIds?` | body của dry-run; không refundMethod/payments |
| `CheckoutReturnPreviewResponseDto` (API, mới) | `returnSubtotal, newSubtotal, newPromotionDiscount, newNet, returnedNet, netAmount, refundedAmount` | = `ComputedTotals`, có `@ApiProperty` để regen client |
| `ReturnableItem` / `EligibleReturnLine` (POS) | `+ promotions: ReturnLinePromotion[]` | mirror API |
| `CartLine` (POS) | `+ returnPromotions?: ReturnLinePromotion[]` | chỉ dòng `isReturnCredit`; persist theo draft như field khác |
| `PromotionItem` (POS) | `description` đã có | không đổi shape |

## Contracts

### POST /v2/promotions/evaluate — response (additive)
```
appliedPrograms[]:   { …cũ, description?: string }
availablePrograms[]: { …cũ, description?: string }
skippedPrograms[]:   { programId, name, reason, takenBy?, type: PromotionProgramType, description?: string }
```
Không có Swagger DTO cho endpoint này; POS dùng type từ `@erp/shared-interfaces`.

### GET /invoices/:id/eligible-returns — mỗi dòng (additive)
```
{ …cũ, promotions: [{ programId, code, name, type, unitDiscount }] }
```
Nguồn: `invoice_checkout_promotions` where `invoice_id = :id`, mỗi
`line_discounts[]` có `lineId` khớp `invoice_items.id` của dòng OUT →
`unitDiscount = round2(discountAmount / quantity)`. `line_discounts` NULL hoặc
`lineId` không khớp → bỏ qua. Thứ tự: theo `priority`, `created_at` như bảng.

### POST /invoices/:id/checkout-return — body (additive)
```
{ …cũ, selectedProgramIds?: uuid[], excludedProgramIds?: uuid[] }
```
Response: `InvoiceEntity` như cũ; `netAmount`, `refundedAmount`, `discountAmount`,
`pointsEarned` phản ánh CTKM. Ma trận `validateRefundMatrix` **không đổi** —
chạy trên `netAmount` đã trừ CTKM.

### POST /invoices/:id/checkout-return/preview — mới (dry-run)
Body: `{ selectedProgramIds?: uuid[], excludedProgramIds?: uuid[] }`.
Response 200:
```
{ returnSubtotal, newSubtotal, newPromotionDiscount, newNet, returnedNet, netAmount, refundedAmount }
```
Cùng guard/permission với `checkout-return` (`pos.return.create`, branch scope
cấp class). Chạy đúng phần đầu của `checkout()` — load draft, validate items,
load HĐ gốc, evaluate dòng OUT, `computeTotals` — và dừng trước
`validateRefundMatrix`/transaction. Không ghi gì, không mint số, không event.
Cùng draft + cùng body gọi bao nhiêu lần cũng cùng số (chỉ đổi khi chương trình
đổi trạng thái giữa hai lần — đúng tư thế preflight). 404/400 như `checkout-return`
cho draft không tồn tại / không phải RETURN|EXCHANGE / không có items.

Sau đó `pnpm openapi:generate` → `schema.ts` + `openapi.snapshot.json`.

### Engine input từ phiếu đổi
```
EvaluateCartDto {
  customerId: invoice.customerId,
  selectedProgramIds, excludedProgramIds,
  lines: items.filter(OUT).map(it => ({ lineId: it.id, itemId, quantity, unitPrice, manualLineDiscount: Number(it.lineDiscount) || undefined }))
}
```
Không có dòng OUT (RETURN thuần) → **không gọi** engine; `newPromotionDiscount = 0`.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| `promotionPreview` (status/data) | `checkout-session.store` slice theo draft | Tab; đổi giỏ/khách/selected/excluded thì re-fetch (đã có) |
| `selectedProgramIds` / `excludedProgramIds` | `promotionDraft` của draft | Tab; giờ được gửi ở cả `checkout-return` |
| `CartLine.returnPromotions` | cart của draft, đặt lúc `buildInvoiceReturnCartLines` | Tab; không re-fetch (snapshot bất biến) |
| Số BE của dry-run (`netAmount`, `refundedAmount`) | biến cục bộ trong `finalize` của `use-checkout-actions` | Một lần bấm Thanh toán; không vào store |
| Số CTKM đã chốt | `invoice_items.promotion_discount` + `invoice_checkout_promotions` | Vĩnh viễn — HĐ post là bất biến |

## Error taxonomy

| Condition | Failure | UI / BE |
| --- | --- | --- |
| `EvaluateCartQuery` ném lỗi trong `checkout-return` (DB, engine) | Lỗi lan lên → 500, phiếu đổi **không** post (chưa vào transaction, không có gì để rollback) | Toast lỗi BE như hôm nay; thu ngân bấm lại |
| Preview `/v2/promotions/evaluate` của POS `unavailable` khi bấm Thanh toán ở tab đổi trả | Không chặn (A-09 rejected) | Số gửi đi lấy từ dry-run BE nên vẫn đúng; panel có thể thiếu CTKM tới khi Thử lại — cùng tư thế ADR-06 checkout-saga |
| `POST checkout-return/preview` lỗi (mạng/BE) | `EXCHANGE_PREVIEW_FAILED` (client) | Toast "Không lấy được số tiền đổi trả từ máy chủ — thử lại"; **không** gọi `checkout-return` vì không có số nào để gửi; phiếu draft vừa tạo được dọn như nhánh lỗi hiện có |
| Chương trình đổi giữa preview và post → BE `netAmount` khác FE | 400 `Tổng payments vượt netAmount` / `payments không được cung cấp khi netAmount < 0` (đã có) | Toast thông điệp BE; preview tự chạy lại khi giỏ đổi hoặc bấm Thử lại |
| `line_discounts` NULL / `lineId` không khớp dòng nào (HĐ cũ) | Không lỗi | `promotions: []`, không nhãn; tiền vẫn theo `refundableUnitPrice` |
| `description` NULL/rỗng | Không lỗi | "—" |
| `SkippedProgram.type` thiếu (BE cũ, POS mới) | Không lỗi | `PROGRAM_TYPE_LABELS[undefined]` → "—" như hôm nay (TS: `type` bắt buộc ở shared, nhưng mapper vẫn `?? "—"`) |
| Engine trả `lineDiscounts[].lineId` không thuộc tập OUT | Không thể xảy ra (chỉ gửi OUT) | Helper ghi bỏ qua id lạ (đã vậy ở saga) |

## Cache & offline

Không cache mới. Preview ở tab đổi trả dùng cùng debounce 300ms + abort như
luồng bán. `CartLine.returnPromotions` persist cùng draft xuống localStorage như
mọi field `CartLine` khác; draft cũ (trước feature) không có field → không nhãn,
không lỗi.

## Observability

- `CheckoutReturnService`: `this.logger.log` một dòng khi có CTKM:
  `Exchange <id>: <n> programme(s) [codes] discount=<amount> newNet=<n>`.
- Snapshot `invoice_checkout_promotions` là dấu vết audit (giống hóa đơn bán).
- e2e AC-10…AC-19 là hợp đồng số; ảnh `evidence/` là hợp đồng hiển thị.

## ADRs

### ADR-01 — Phiếu đổi tự dispatch `EvaluateCartQuery` ở preflight, không đi qua saga
**Context:** Dòng mua thêm cần CTKM. Luồng bán đánh giá trong
`EvaluatePromotionStep` (preflight của saga); `CheckoutReturnService` là service
độc lập với ma trận hoàn tiền/cấn nợ riêng.
**Decision:** `CheckoutReturnService.checkout` gọi `queryBus.execute(new
EvaluateCartQuery(dto, actor))` trên dòng OUT ngay sau khi load items, trước
`computeTotals` và trước transaction — cùng tư thế "đọc ngoài transaction" của
saga (A-11 của checkout-saga). Không import `PromotionResolver`; `QueryBus` đã
có sẵn trong `PosModule` vì `PromotionModule` được import.
**Consequences:** Hai luồng cùng một engine, cùng một tập chương trình tại thời
điểm post. Chương trình đổi giữa preview và post cho ra 400 rõ ràng thay vì số
lệch âm thầm. `CheckoutReturnService` thêm 1 dependency (`QueryBus`).
**Status:** accepted

### ADR-02 — Ghi CTKM của phiếu đổi bằng helper dùng chung với `persist-invoice.step.ts`
**Context:** Snapshot `invoice_checkout_promotions` + `promotion_discount` từng
dòng đang được ghi ở `PersistInvoiceStep` bằng hai private method. Phiếu đổi
cần đúng hai thao tác đó trên dòng OUT.
**Decision:** Tách hai method thành `persistAppliedPromotions(manager, { actor,
invoiceId, items, appliedPrograms })` trong
`pos/checkout-saga/infrastructure/applied-promotion-writer.ts` (mới, cạnh
entity), `PersistInvoiceStep` và `CheckoutReturnService` cùng gọi. `lineTotal`
không đổi; `subtotal = Σ lineTotal` giữ nguyên bất biến. Header
`invoice.discountAmount` của phiếu đổi = `newPromotionDiscount` (A-07).
**Consequences:** Một chỗ duy nhất biết cách ghi snapshot; `persist-invoice.step.spec.ts`
phải vẫn xanh sau tách. `refundableUnitValues` đọc `promotion_discount` nên trả
lại món mua thêm về sau tự hoàn đúng (AC-17) mà không sửa gì thêm.
**Status:** accepted

### ADR-03 — Chiều tiền và trần thanh toán của phiếu đổi lấy từ dry-run của chính `CheckoutReturnService`
**Context:** `use-checkout-actions` tính `net = newSubtotal − returnSubtotal`
với cả hai vế là `payloadLineSubtotal` (giá niêm yết − giảm tay). BE
`computeTotals` dùng `returnedNet` (refundable) và, từ feature này, `newNet`
(sau CTKM). BE từ chối `Σpayments > netAmount` và từ chối payments khi
`netAmount ≤ 0`, nên FE lệch là 400 hoặc ghi nợ nhầm (A-08). Bản đầu định cho
FE chép công thức BE; Akenzy đồng thời muốn thanh toán được khi preview POS
hỏng (A-09) — hai công thức ở hai nơi không đáp ứng được cả hai.
**Decision:** Thêm `POST /invoices/:id/checkout-return/preview`: `checkout()` tách
thành `prepare(id, ids, actor)` (load, validate, HĐ gốc, evaluate, `computeTotals`)
và phần post; `preview()` = `prepare()` rồi trả `ComputedTotals`. FE sau khi tạo
phiếu gọi preview, dựng payload từ `netAmount`/`refundedAmount` của BE: net > 0 →
payments với `amount` kẹp `min(số panel, netAmount)`; = 0 → OFFSET; < 0 → refund.
Xóa công thức chiều tiền ở FE; `payloadLineSubtotal` chỉ còn cho hiển thị/receipt.
**Consequences:** Thêm một request cho mỗi lần Thanh toán đổi/trả. Vế trả tự
đúng (A-08 confirmed) mà không cần FE biết `refundableUnitPrice`. Số panel và số
BE có thể lệch khi preview POS hỏng — nhưng số **gửi đi** luôn là số BE; hóa đơn
in lấy `pointsEarned`/`code` từ response như hôm nay.
**Status:** accepted

### ADR-04 — Số âm là số đúng của phiếu đổi/trả: bỏ kẹp `Math.max(0, …)` cho dòng trả và *Tổng tiền*
**Context:** #286 thêm kẹp ở `displayLineTotal` và `PaymentSummaryBlock.total`
để phòng CTKM > tiền dòng; hệ quả là dòng trả in 0 và *Tổng tiền* in 0 (ảnh 3),
trong khi *Trả lại khách* vẫn đúng. Trước #286 hai số này âm; MISA cũng in âm.
**Decision:** Kẹp chỉ áp cho dòng bán (`isReturnLine ? rowTotal : Math.max(0,
rowTotal − promotionItemDiscount)`); `PaymentSummaryBlock.total = grandTotal −
bucketTotals.item` không kẹp (grandTotal âm khi phiếu trả). Bất biến ADR-02 của
2026091804 (`Σ Thành tiền = Tổng tiền`) giữ nguyên, giờ đúng cả khi âm.
**Consequences:** Hai chỗ đổi, không đụng `lineTotal()`/`selectGrandTotal`.
**Status:** accepted

### ADR-05 — Preview CTKM của POS không bao giờ chặn Thanh toán; dry-run BE là nguồn số duy nhất
**Context:** Luồng bán dùng `amountDue` của draft (BE) làm trần nên preview hỏng
vẫn thu được (ADR-06 checkout-saga). Phiếu đổi không có số BE nào trước
`checkout-return`. Bản đầu đề xuất chặn; Akenzy từ chối 2026-09-21 (A-09).
**Decision:** Không có trạng thái chặn theo preview POS. Nguồn số lúc post là
dry-run ở ADR-03. Chỉ khi chính dry-run lỗi (BE không tới được) mới toast và
không post — lúc đó `checkout-return` cũng sẽ không tới được.
**Consequences:** UX giống luồng bán: CTKM luôn được BE áp dù màn hình chưa kịp
hiện. Bù lại phải chấp nhận panel/bản in tạm tính có thể chưa có nhãn CTKM khi
evaluate POS hỏng (như luồng bán hôm nay). `retrySeq` + nút Thử lại trong modal
vẫn là cách lấy lại nhãn.
**Status:** accepted
