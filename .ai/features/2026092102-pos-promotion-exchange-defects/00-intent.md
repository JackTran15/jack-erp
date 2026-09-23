---
feature: pos-promotion-exchange-defects
slug: 2026092102-pos-promotion-exchange-defects
owner: Akenzy
created: 2026-09-21
status: draft
---

# Intent — POS: CTKM trong modal, trên dòng trả và trên phần mua thêm của phiếu đổi

## Problem

QA 2026-09-21 (ảnh trên `jack-erp-pos.ducanhzed.com` và `localhost:3001`) báo ba
lỗi quanh CTKM ở POS. Mã đã đọc trên `main` (`6159b584`, đã gồm PR #286
`pos-line-promotion-breakdown` và `ctkm-item-discount-invoice-scope`):

**1. Modal *Chương trình khuyến mãi* không hiện *Hình thức* và *Mô tả*.**
Cả hai cột in "—" cho hai CTKM đang ở trạng thái *Đã bỏ áp dụng*.
`mapEvaluateResponseToPromotionItems` (`promotionPresentation.ts`) gán cứng
`kindLabel: "—"` cho mọi dòng `skippedPrograms` vì `SkippedProgram` không mang
`type`; và không dòng nào (applied / available / skipped) có `description`, dù
domain model `PromotionProgram` lẫn entity đều có cột đó. Với thu ngân, hai CTKM
cùng tên gần giống nhau là không phân biệt được.

**2. Đổi trả hàng theo hóa đơn có KM: dòng trả không hiện KM, *Thành tiền* = 0.**
Ảnh 3: trả `ABA2777-N-42` (giá 750.000, HĐ gốc có *Giảm giá hàng hoá ABA2777
15%*) → cột *Thành tiền* in **0**, *Tổng tiền* **0**, trong khi *Trả lại khách*
đúng 637.500. Ảnh 4 (MISA) là mẫu: ~~-1.200.000~~ **-840.000** và nhãn KM đỏ
dưới tên. Hai nguyên nhân:
- PR #286 đưa vào `Math.max(0, …)` ở `InvoiceLineItemRow` (`displayLineTotal`)
  và `PaymentSummaryBlock` (`total`); trước đó dòng trả in `-637.500` và *Tổng
  tiền* âm. Đây là **regression**.
- `GET /invoices/:id/eligible-returns` chỉ trả `refundableUnitPrice` (đã trừ KM
  phân bổ) — không có tên CTKM. Snapshot `invoice_checkout_promotions.line_discounts`
  của HĐ gốc (khóa `invoice_items.id` = `originalInvoiceItemId`) có đúng dữ liệu
  đó và đã được `GET /invoices/:id` trả ra từ feature 2026091804.

**3. Đổi trả hàng: phần *mua thêm* không áp được KM.** Ảnh 5: tab đổi trả (1 trả
+ 9 mua thêm) mở modal → *"Chưa có chương trình khuyến mãi nào để áp dụng"*.
- Client: `useCheckoutPromotionPreview` đặt preview về `idle` cho mọi variant
  khác `SALE`; `selectedProgramIds`/`excludedProgramIds` chỉ gửi ở checkout bán.
- Server: `CheckoutReturnService.checkout` **không** gọi `EvaluateCartQuery`.
  Nó chỉ chép KM của HĐ gốc lên dòng trả (IN); dòng mua thêm (OUT) tính đủ giá
  niêm yết → `netAmount` thu khách **cao hơn** chính sách CTKM đang chạy.
  Đây không phải lỗi hiển thị — là tính năng còn thiếu ở BE.

## Affected personas

| Persona | Hiện tại | Mong muốn |
| --- | --- | --- |
| Thu ngân POS | Modal chỉ có tên + trạng thái; dòng trả in 0 và không nói được KM nào; mua thêm khi đổi hàng không có CTKM | Modal đủ *Hình thức* + *Mô tả*; dòng trả hiện nhãn CTKM và số âm sau KM như dòng bán; mua thêm được CTKM y hệt bán thường, chọn/bỏ trong cùng modal |
| Khách hàng | Đổi hàng thì mất CTKM trên món mua thêm | Mua thêm trong phiếu đổi hưởng CTKM như mua mới |
| Kế toán | Phiếu đổi không có KM, không có snapshot CTKM | Phiếu đổi có `promotionDiscount` từng dòng OUT + snapshot như HĐ bán; trả lại món mua thêm sau này hoàn đúng số đã trả |

## Success signal

Đo trực tiếp trên `erp_test` (e2e) và ảnh headless POS (`capture-pos-evidence.py`
mở rộng từ 2026091804):

1. Giỏ có 2 CTKM (một *Giảm giá hàng hoá*, một *Giảm giá hoá đơn*) cả hai *Đã bỏ
   áp dụng*: modal in *Hình thức* = "Giảm giá mặt hàng" / "Giảm giá hoá đơn" và
   *Mô tả* = đúng chuỗi `description` của chương trình; "—" **chỉ** khi
   `description` rỗng. Áp cho cả 3 nhóm applied / available / skipped.
2. Trả 1 × `ABA2777-N-42` theo HĐ có *Giảm giá hàng hoá ABA2777 15%*: dòng trả
   có nhãn `Giảm giá hàng hoá ABA2777 15% (112.500)`, *Thành tiền*
   ~~-750.000~~ **-637.500**, *Tổng tiền* **-637.500**, *Trả lại khách* vẫn
   **637.500** — số tiền không đổi, chỉ hiển thị đổi.
3. Phiếu đổi: trả 1 × `ABA2777-N-42` (hoàn 637.500) + mua thêm 1 × `ABA2777-N-41`
   (750.000, CTKM 15% đang chạy): modal liệt kê CTKM là *Đã áp dụng*; dòng mua
   thêm có nhãn + ~~750.000~~ **637.500**; *Còn phải thu* = **0**. Sau *Thanh
   toán*, `SELECT` cho `invoice_items.promotion_discount = 112500` trên dòng OUT,
   đúng 1 dòng `invoice_checkout_promotions` cho phiếu đổi, `invoices.net_amount = 0`,
   `points_earned = floor(637500 / rate)`. Cùng kịch bản ở đổi trả nhanh cho
   cùng số.
4. Bỏ tick CTKM trong modal ở tab đổi trả → preview và số BE chốt đều không
   giảm (`excludedProgramIds` đi tới `checkout-return`). Số gửi đi luôn là số
   BE trả ở `checkout-return/preview` — kể cả khi `evaluate` của POS đang lỗi
   (Akenzy chốt: không chặn thu ngân).
5. Không test promotion / checkout / return nào đang xanh chuyển đỏ;
   `pnpm openapi:generate` chỉ thêm field mới trên `CheckoutReturnDto`.

## Out of scope

- **Nhãn CTKM cho dòng trả trên bản in** (in tạm tính / sau thanh toán) — Akenzy
  chốt 2026-09-21: dòng mua thêm có (đi qua `promotionEngineDiscounts` sẵn có),
  dòng trả để feature sau.
- **Quà tặng (`GIFT_ITEM`, `gifts[]`) trong phiếu đổi** — engine vẫn có thể trả
  `gifts`, nhưng phiếu đổi không sinh dòng quà; `discountAmount` của loại này
  là 0 nên không lệch tiền. Ghi A-05.
- **Đánh giá lại CTKM cho phần trả** — dòng trả giữ `refundableUnitPrice` từ
  HĐ gốc; không gọi engine trên dòng IN.
- **Backoffice-web chi tiết hóa đơn** và **`modules/mobile`** — chỉ POS + API.
- **Đổi cách engine tính / phân bổ**, **voucher**, **dùng điểm** trong phiếu đổi
  — không đụng.
- **Backfill** phiếu đổi đã post trước feature — HĐ đã post là bất biến.

## Constraints

| Kind | Detail |
| --- | --- |
| Server chốt số | ADR-06 `checkout-saga`: client chỉ gửi `selectedProgramIds`/`excludedProgramIds`, không gửi số tiền CTKM; `CheckoutReturnService` tự gọi `EvaluateCartQuery` trên dòng OUT |
| Bất biến hiển thị | ADR-02/03 của 2026091804: không sửa `lineTotal()`/`selectGrandTotal`; CTKM chỉ trừ ở tầng hiển thị; `Σ Thành tiền = Tổng tiền` — với phiếu đổi, cả hai được **âm** |
| Snapshot | Dòng trả đọc tên CTKM từ `invoice_checkout_promotions` của HĐ gốc — không gọi lại engine lúc trả |
| Branch scope | `EvaluateCartQuery` cần `actor.branchId`; `InvoiceController` đã có `@RequireBranchScope()` cấp class nên `checkout-return` thỏa sẵn |
| Kiểu dữ liệu | `SkippedProgram` thêm `type`, cả ba nhóm thêm `description?` — additive trên `@erp/shared-interfaces`; evaluate không có Swagger DTO nên không regen client cho phần này |
| API | `CheckoutReturnDto` thêm 2 mảng tùy chọn → `pnpm openapi:generate` + commit `schema.ts` |
| Test | POS không có test runner (`"test": "echo test"`) → ảnh headless + assert DOM; BE bằng Jest e2e trên `erp_test` |
| Ngôn ngữ | Chuỗi UI tiếng Việt; enum giữ tiếng Anh; số qua `formatVnd` |

## Existing surface touched

**Tái sử dụng:**
- `buildLinePromotionIndex` / `formatPromotionLabel` (`linePromotionIndex.ts`) — nhãn dòng
- `EvaluateCartQuery` + `EvaluateCartDto` — như `evaluate-promotion.step.ts`
- `InvoiceCheckoutPromotionEntity` + cách ghi ở `persist-invoice.step.ts`
- `refundableUnitValues` — đã đọc `promotionDiscount` từng dòng, nên trả lại món mua thêm của phiếu đổi tự đúng
- `capture-pos-evidence.py` (2026091804) — ảnh headless

**Sửa:**
- API: `promotion/domain/model/evaluation.ts`, `promotion-resolver.ts`,
  `pos/services/checkout-return.service.ts` (+ dry-run
  `POST /invoices/:id/checkout-return/preview`, ADR-03), `return-eligibility.service.ts`,
  `pos/dto/checkout-return.dto.ts`, `pos/controllers/invoice.controller.ts`
- Shared: `packages/shared-interfaces/src/promotion/index.ts`
- POS: `promotionPresentation.ts`, `use-checkout-promotion-preview.ts`,
  `use-checkout-actions.ts`, `returnInvoicePayloadMapper.ts`, `services/invoice.service.ts`,
  `hooks/react-query/use-query-invoice.ts`,
  `InvoiceLineItemRow.tsx`, `PaymentSummaryBlock.tsx`, `toCheckoutCartLines.ts`,
  `returnInvoiceMapper.ts`, `return-goods.interface.ts`, `checkout.interface.ts`
- `packages/api-client` (generated), `openapi.snapshot.json`

**Feature liền kề:** `2026091804-pos-line-promotion-breakdown` (nhãn dòng bán),
`2026091803-ctkm-item-discount-invoice-scope` (engine NON_PROMO_ONLY),
`quick-exchange-line-discount` (giảm tay trên dòng đổi), `pos-promotion-apply`
(selected/excluded ids), `return-points-net-basis` (điểm hoàn theo net).
