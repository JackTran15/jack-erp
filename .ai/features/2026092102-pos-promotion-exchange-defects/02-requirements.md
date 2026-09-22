---
feature: pos-promotion-exchange-defects
stories: 4
acceptance_criteria: 28
---

# Requirements — POS: CTKM trong modal, trên dòng trả và trên phần mua thêm của phiếu đổi

Số liệu viết theo fixture e2e `apps/api/test/e2e/setup/promotion-seed.ts`:
`SKU-685` = 685.000, `SKU-100` = 100.000, `itemDiscountBody()` = *Giảm giá hàng
hóa 30%* (`ITEM_DISCOUNT`, `PERCENT 30`, `autoApply: true`). 30% của 685.000 =
**205.500** → giá sau CTKM **479.500**; 30% của 100.000 = **30.000**.

## US-01 — Modal *Chương trình khuyến mãi* hiện *Hình thức* và *Mô tả*

As a thu ngân, I want mỗi dòng CTKM trong modal nói rõ hình thức và mô tả
so that tôi phân biệt được hai chương trình cùng tên gần nhau trước khi tick.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Response `evaluate` mang `type` + `description` cho cả ba nhóm
```gherkin
Given một CTKM ITEM_DISCOUNT có description "Áp cho giày nữ" đang áp (applied),
  một CTKM INVOICE_DISCOUNT autoApply=false đủ điều kiện (available),
  và một CTKM đã bị thu ngân loại qua excludedProgramIds (skipped, EXCLUDED_BY_CASHIER)
When gọi POST /v2/promotions/evaluate
Then appliedPrograms[0].description = "Áp cho giày nữ"
And availablePrograms[0].type và .description có mặt
And skippedPrograms[0].type = "ITEM_DISCOUNT" và .description có mặt
And mọi field cũ của ba nhóm giữ nguyên giá trị (additive)
```

**AC-02** — Dòng applied / available in nhãn hình thức + mô tả
```gherkin
Given preview evaluate có CTKM ITEM_DISCOUNT đang áp với description "Áp cho giày nữ"
When mở modal Chương trình khuyến mãi
Then cột Hình thức của dòng đó = "Giảm giá mặt hàng"
And cột Mô tả = "Áp cho giày nữ"
```

**AC-03** — Dòng skipped (kể cả *Đã bỏ áp dụng*) in nhãn hình thức
```gherkin
Given hai CTKM (một ITEM_DISCOUNT, một INVOICE_DISCOUNT) đều đang ở trạng thái "Đã bỏ áp dụng"
When mở modal Chương trình khuyến mãi
Then cột Hình thức lần lượt = "Giảm giá mặt hàng" và "Giảm giá hoá đơn", không còn "—"
And cột Trạng thái vẫn = "Đã bỏ áp dụng"
```

**AC-04** — Mô tả rỗng
```gherkin
Given một CTKM có description NULL hoặc chuỗi rỗng
When mở modal Chương trình khuyến mãi
Then cột Mô tả của dòng đó = "—"
And cột Hình thức vẫn in đúng nhãn loại
```

## US-02 — Dòng trả theo hóa đơn hiện CTKM của hóa đơn gốc và số âm sau KM

As a thu ngân, I want dòng hàng trả cho thấy món đó đã được CTKM nào giảm bao
nhiêu và thành tiền âm sau KM so that tôi giải thích được cho khách vì sao hoàn
637.500 chứ không phải 750.000.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-05** — `eligible-returns` mang CTKM phân bổ từng dòng từ snapshot
```gherkin
Given hóa đơn bán S: 2 × SKU-685, CTKM "Giảm giá hàng hóa 30%" đã áp (promotion_discount = 411.000, snapshot line_discounts có lineId = invoice_items.id của dòng đó)
When gọi GET /invoices/S/eligible-returns
Then dòng SKU-685 có promotions = [{ programId, code, name: "Giảm giá hàng hóa 30%", type: "ITEM_DISCOUNT", unitDiscount: 205500 }]
And refundableUnitPrice = 479500 (không đổi so với hôm nay)
```

**AC-06** — Dòng không có snapshot
```gherkin
Given hóa đơn bán không có CTKM (không có dòng invoice_checkout_promotions), hoặc hóa đơn cũ có promotion_discount nhưng line_discounts NULL
When gọi GET /invoices/:id/eligible-returns
Then mỗi dòng có promotions = []
And refundableUnitPrice giữ nguyên cách tính hôm nay
```

**AC-07** — Dòng trả vẽ nhãn CTKM và Thành tiền âm gạch giá gốc
```gherkin
Given tab đổi trả theo hóa đơn S, dòng trả 1 × SKU-685 (unitPrice 685.000, refundableUnitPrice 479.500, promotions từ AC-05)
When bảng dòng hàng render
Then dưới tên hàng có nhãn đỏ nghiêng "Giảm giá hàng hóa 30% (205.500)"
And cột Thành tiền hiện "-685.000" gạch ngang và "-479.500" bên dưới
And tăng SL trả lên 2 thì nhãn thành "(411.000)" và Thành tiền "-1.370.000" / "-959.000"
```

**AC-08** — Tổng tiền âm, Trả lại khách không đổi
```gherkin
Given tab đổi trả chỉ có dòng trả ở AC-07 (SL 1)
When panel thanh toán render
Then "Tổng tiền" = "-479.500" (không còn kẹp về 0)
And "Trả lại khách" = "479.500" và ô Tiền mặt = "479.500" — y hệt hôm nay
```

**AC-09** — Dòng trả không có CTKM (đổi trả nhanh hoặc HĐ gốc không KM)
```gherkin
Given tab đổi trả nhanh với dòng trả 1 × SKU-100 không có hóa đơn gốc
When bảng dòng hàng render
Then không có nhãn CTKM dưới tên
And cột Thành tiền hiện "-100.000" (một dòng, không gạch) — hết regression "0"
```

## US-03 — Server áp CTKM cho dòng mua thêm của phiếu đổi

As a kế toán, I want phiếu đổi ghi nhận CTKM trên dòng mua thêm y hệt hóa đơn
bán so that số thu khách, snapshot, điểm và phần hoàn về sau đều theo chính sách
CTKM đang chạy.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-10** — Đổi trả theo hóa đơn: CTKM autoApply áp lên dòng OUT
```gherkin
Given hóa đơn bán S: 1 × SKU-685 không CTKM (refundableUnitPrice 685.000)
And CTKM "Giảm giá hàng hóa 30%" target SKU-100 đang chạy, autoApply
And phiếu đổi E (POST /invoices/exchanges): returnLines 1 × SKU-685 theo S, newLines 2 × SKU-100
When POST /invoices/E/checkout-return với refundMethod CASH, không payments
Then response netAmount = -545000 (= 140.000 − 685.000) và refundedAmount = 545000
And invoice_items dòng OUT SKU-100 có promotion_discount = 60000, line_total = 200000 (không đổi)
And invoice_checkout_promotions có đúng 1 dòng cho E: name "Giảm giá hàng hóa 30%", discount_amount 60000, line_discounts[0].lineId = id dòng OUT
And invoices.net_amount = -545000
```

**AC-11** — Đổi trả nhanh (không hóa đơn gốc) cũng áp
```gherkin
Given phiếu đổi nhanh Q: returnLines 1 × SKU-100 (không originalInvoiceId), newLines 1 × SKU-685
And CTKM 30% target SKU-685 đang chạy
When POST /invoices/Q/checkout-return với payments [CASH 379500]
Then 201, netAmount = 379500 (= 479.500 − 100.000), totalPaid = 379500
And dòng OUT có promotion_discount = 205500; có 1 dòng snapshot cho Q
```

**AC-12** — `excludedProgramIds` giữ CTKM ngoài phiếu đổi
```gherkin
Given phiếu đổi như AC-11
When POST checkout-return với excludedProgramIds: [P] và payments [CASH 585000]
Then 201, netAmount = 585000, dòng OUT promotion_discount = 0, không có dòng snapshot
```

**AC-13** — `selectedProgramIds` bật CTKM autoApply=false
```gherkin
Given CTKM 30% target SKU-685 với autoApply=false
And phiếu đổi nhanh như AC-11
When POST checkout-return KHÔNG có selectedProgramIds và payments [CASH 585000]
Then 201, netAmount = 585000, không snapshot
When POST checkout-return (phiếu mới cùng dữ liệu) với selectedProgramIds: [P] và payments [CASH 379500]
Then 201, netAmount = 379500, có snapshot P
```

**AC-14** — Dòng trả (IN) không đi qua engine
```gherkin
Given CTKM 30% target SKU-685 đang chạy
And phiếu đổi: returnLines 1 × SKU-685 theo hóa đơn S không CTKM, newLines 1 × SKU-100 (không CTKM target)
When POST checkout-return
Then dòng IN SKU-685 có promotion_discount = 0 (chỉ mang phần chép từ S, ở đây 0)
And không có dòng snapshot, netAmount = 100.000 − 685.000 = -585000
```

**AC-15** — Tích điểm trên tiền mua thêm sau CTKM
```gherkin
Given phiếu đổi có customer, newLines 2 × SKU-100 với CTKM 30% (newNet 140.000)
When POST checkout-return
Then invoices.points_earned = floor(140000 / POINT_EARN_VND_PER_POINT), không phải floor(200000 / rate)
```

**AC-16** — Header `discount_amount` của phiếu đổi
```gherkin
Given phiếu đổi ở AC-10
When đã post
Then invoices.discount_amount = 60000 (= Σ promotion_discount dòng OUT)
And với phiếu đổi không CTKM thì discount_amount = 0 như hôm nay
```

**AC-17** — Trả lại món mua thêm của phiếu đổi về sau hoàn đúng số đã trả
```gherkin
Given phiếu đổi Q đã post ở AC-11 (dòng OUT SKU-685 promotion_discount 205.500)
When gọi GET /invoices/Q/eligible-returns
Then dòng SKU-685 có refundableUnitPrice = 479500 và promotions[0].unitDiscount = 205500
```

**AC-18** — `GET /invoices/:id` của phiếu đổi trả `appliedPromotions`
```gherkin
Given phiếu đổi Q đã post ở AC-11
When gọi GET /invoices/Q
Then appliedPromotions = [{ name "Giảm giá hàng hóa 30%", type ITEM_DISCOUNT, discountAmount 205500, lineDiscounts: [{ lineId = id dòng OUT, discountAmount 205500 }] }]
```

**AC-19** — Chiều tiền dùng số net của cả hai vế
```gherkin
Given hóa đơn S: 1 × SKU-685 có CTKM 30% (refundableUnitPrice 479.500)
And phiếu đổi: returnLines 1 × SKU-685 theo S, newLines 1 × SKU-100 với CTKM 30% target SKU-100 (newNet 70.000)
When POST checkout-return với refundMethod CASH, không payments
Then 201, netAmount = -409500 (= 70.000 − 479.500), refundedAmount = 409500
And POST cùng phiếu với payments [CASH 100000] bị 400 (payments không được cung cấp khi netAmount < 0)
```

**AC-28** — Dry-run `checkout-return/preview` trả đúng số mà post sẽ chốt
```gherkin
Given phiếu đổi draft E như AC-10 (returnLines 1 × SKU-685 theo S, newLines 2 × SKU-100, CTKM 30% target SKU-100)
When POST /invoices/E/checkout-return/preview với body {} (không refundMethod, không payments)
Then 200 với { returnSubtotal: 685000, newSubtotal: 200000, newPromotionDiscount: 60000, newNet: 140000, returnedNet: 685000, netAmount: -545000, refundedAmount: 545000 }
And phiếu E vẫn là draft, không có dòng snapshot, invoice_items.promotion_discount vẫn 0
When POST /invoices/E/checkout-return/preview với excludedProgramIds: [P]
Then newPromotionDiscount = 0, netAmount = -485000
When sau đó POST /invoices/E/checkout-return với cùng excludedProgramIds
Then netAmount của phiếu đã post = -485000 — bằng preview
```

## US-04 — POS: phần mua thêm của tab đổi trả dùng CTKM như bán thường

As a thu ngân, I want tab đổi trả hiện CTKM cho món mua thêm, chọn/bỏ trong
modal và thu đúng số so that khách được KM khi đổi hàng và nút Thanh toán không
bị BE từ chối.

**Priority:** must
**Depends on:** US-03

### Acceptance criteria

**AC-20** — Preview chạy ở tab đổi trả, chỉ trên dòng mua thêm
```gherkin
Given tab đổi trả theo hóa đơn có 1 dòng trả (isReturnCredit) và 2 dòng mua thêm
When giỏ đổi
Then POST /v2/promotions/evaluate được gọi với đúng 2 lines (không có dòng trả), kèm customerId, selectedProgramIds, excludedProgramIds
And tab đổi trả nhanh (returnCart riêng) cũng gọi với đúng các dòng mua thêm
And tab chỉ có dòng trả vẫn gọi evaluate với lines: [] (để modal load được danh sách)
```

**AC-21** — Modal ở tab đổi trả liệt kê và toggle được
```gherkin
Given tab đổi trả với dòng mua thêm 1 × ABA2777-N-41 và CTKM "Giảm giá hàng hoá ABA2777 15%" đang chạy
When mở modal Chương trình khuyến mãi
Then CTKM hiện với trạng thái "Đã áp dụng" (không còn "Chưa có chương trình khuyến mãi nào để áp dụng")
When bấm bỏ áp dụng
Then dòng chuyển "Đã bỏ áp dụng", nhãn trên dòng mua thêm biến mất, và excludedProgramIds mang id đó khi Thanh toán
```

**AC-22** — Dòng mua thêm vẽ nhãn + Thành tiền như luồng bán
```gherkin
Given tab đổi trả với dòng mua thêm 1 × ABA2777-N-41 (750.000) và CTKM 15% đang áp
When bảng dòng hàng render
Then dưới tên có nhãn "Giảm giá hàng hoá ABA2777 15% (112.500)" và Thành tiền "750.000" gạch / "637.500"
And dòng trả cùng bảng không nhận nhãn từ preview (chỉ nhãn snapshot của AC-07)
```

**AC-23** — Panel: Tổng tiền / Khuyến mại / chiều tiền
```gherkin
Given tab đổi trả: trả 1 × ABA2777-N-42 (refundable 637.500) + mua 1 × ABA2777-N-41 (750.000, CTKM 15% → 637.500)
When panel render
Then "Tổng tiền" = "0" (= 637.500 − 637.500), không có dòng "Còn phải thu" dương lẫn "Trả lại khách" dương
When bỏ CTKM trong modal
Then "Còn phải thu" = "112.500"
When thêm CTKM hóa đơn 10% (INVOICE_DISCOUNT) đang áp
Then dòng "Khuyến mại" của panel chỉ mang phần CTKM hóa đơn, "Tổng tiền" không trừ phần đó (ADR-02 của 2026091804 giữ nguyên)
```

**AC-24** — Payload `checkout-return` dựng từ số BE trả ở preview
```gherkin
Given tab đổi trả: trả 1 × ABA2777-N-42 (refundable 637.500) + mua 1 × ABA2777-N-41 (750.000, CTKM 15% đang áp)
When bấm Thanh toán
Then POS gọi POST /invoices/exchanges, rồi POST /invoices/:id/checkout-return/preview với selectedProgramIds/excludedProgramIds của draft
And body checkout-return có refundMethod OFFSET, không payments (preview.netAmount = 0), kèm selectedProgramIds/excludedProgramIds
Given cùng tab nhưng CTKM đã bỏ trong modal (preview.netAmount = 112.500)
When bấm Thanh toán
Then body có payments tổng 112.500 (= min(số panel, preview.netAmount)) và excludedProgramIds: [id]
Given tab trả 1 × ABA2777-N-42 (refundable 637.500) + mua 1 × ABA3335 700.000 không CTKM
When bấm Thanh toán
Then preview.netAmount = 62.500 → body là thu 62.500, không phải hoàn 50.000 (= 750.000 − 700.000) như hôm nay
```

**AC-25** — Preview CTKM của POS chưa sẵn sàng thì vẫn thanh toán được, số theo BE
```gherkin
Given tab đổi trả có 1 dòng mua thêm có CTKM và POST /v2/promotions/evaluate đang lỗi (preview "unavailable")
When bấm Thanh toán
Then POS vẫn gọi exchanges → checkout-return/preview → checkout-return
And body checkout-return dựng từ preview BE (chiều tiền + số tiền), không từ số panel đang thiếu CTKM
And phiếu đã post có promotion_discount trên dòng mua thêm như AC-10
Given POST /invoices/:id/checkout-return/preview lỗi (BE không tới được)
When bấm Thanh toán
Then hiện toast lỗi tiếng Việt và KHÔNG gọi checkout-return (không có số nào để gửi)
```

**AC-26** — Giảm tay `percent` cũng đi vào evaluate
```gherkin
Given dòng 1 × 685.000 có giảm tay percent 10% (lineDiscountAmount 68.500)
When preview evaluate được gọi
Then line.manualLineDiscount = 68500 (hôm nay bị bỏ trống với percent)
And với giảm tay amount 50.000 thì manualLineDiscount = 50000 như cũ
```

**AC-27** — Bản in phiếu đổi mang nhãn CTKM ở dòng mua thêm
```gherkin
Given tab đổi trả ở AC-23 với CTKM đang áp
When In tạm tính
Then dòng mua thêm trên bản in có nhãn "Giảm giá hàng hoá ABA2777 15% (112.500)" và lineTotal 637.500
And khối "Tiền hàng trả lại" giữ nguyên, không có nhãn CTKM ở dòng trả (A-04)
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Tương thích | Mọi test promotion / checkout-saga / return / exchange đang xanh vẫn xanh; `SkippedProgram.type` và `description?` là additive trên `@erp/shared-interfaces` | T-01-01, T-03-04 |
| Idempotency | `checkout-return/preview` là POST chỉ đọc — không ghi, không sinh số chứng từ, không phát event; gọi nhiều lần cùng body cho cùng số | T-03-06 |
| API client | `pnpm openapi:generate` chỉ thêm `selectedProgramIds`/`excludedProgramIds` vào `CheckoutReturnDto` và endpoint `checkout-return/preview` mới; `schema.ts` + `openapi.snapshot.json` commit cùng | T-03-05 |
| Kiểu | `tsc --noEmit` pos-web và api xanh sau mỗi ticket | mọi ticket POS |
| Bằng chứng | Ảnh headless cho AC-02/03/04/07/08/09/21/22/23/25/27 lưu `evidence/` của feature | T-02-03, T-04-04 |
