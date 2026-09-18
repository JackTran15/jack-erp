---
feature: pos-line-promotion-breakdown
stories: 5
acceptance_criteria: 17
---

# Requirements — POS: CTKM tự áp dụng hiện trên từng dòng hàng và hóa đơn

Fixture dùng xuyên suốt là bộ đã dựng trên DB của API (`erp_dev_3008`, feature
2026091803): `SKU-685` = 685.000, `SKU-100` = 100.000, `KM000003` CTKM-A giảm
giá hàng hóa 10% trên `SKU-685`, `KM000004` CTKM-B giảm giá hóa đơn 10%
`NON_PROMO_ONLY`. Giỏ hai dòng ⇒ engine trả `appliedPrograms`:
`KM000003 → L685 68.500 (unitPriceAfter 616.500)`, `KM000004 → L100 10.000
(unitPriceAfter 90.000)`. Mọi con số dưới đây suy từ đó.

Ký hiệu **[DB]** = phải đọc từ bảng; **[ẢNH]** = chứng minh bằng ảnh headless
có assert DOM (A-10).

---

## US-01 — Dòng hàng cho thấy CTKM nào đang giảm, giảm bao nhiêu, còn bao nhiêu

Là thu ngân, tôi muốn nhìn dòng hàng là biết món này được chương trình nào giảm
và giá sau giảm, để trả lời khách mà không phải mở modal hay in tạm tính.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — CTKM hàng hóa vẽ như giảm giá tay [ẢNH]
```gherkin
Given giỏ có SKU-685 và CTKM-A (hàng hóa 10%) đang áp
When màn hình bán hàng hiển thị dòng SKU-685
Then dưới tên hàng có nhãn đỏ nghiêng "CTKM-A hang hoa 10% SKU-685 - claude (68.500)"
And cột Thành tiền gạch 685.000 và ghi 616.500 bên dưới
And cột Đơn giá vẫn là 685.000
```

**AC-02** — CTKM hóa đơn phân bổ xuống dòng: nhãn có, giá không gạch (A-01) [ẢNH]
```gherkin
Given giỏ SKU-685 + SKU-100, CTKM-A và CTKM-B cùng áp
When màn hình hiển thị dòng SKU-100
Then dưới tên hàng có nhãn "CTKM-B hoa don 10% NON_PROMO_ONLY - claude (10.000)"
And cột Thành tiền của SKU-100 vẫn là 100.000, không gạch
```

**AC-03** — Không CTKM nào chạm dòng thì dòng không đổi
```gherkin
Given giỏ có một hàng không thuộc CTKM nào và không có giảm tay
When màn hình hiển thị dòng đó
Then không có nhãn dưới tên, Thành tiền không gạch — y hệt hôm nay
```

**AC-04** — Giảm tay + CTKM hàng hóa cộng dồn trên cùng dòng (A-09) [ẢNH]
```gherkin
Given dòng SKU-685 có giảm tay 50.000 (lý do "test") và CTKM-A 10% đang áp
When engine đánh giá lại (10% của 635.000 = 63.500)
Then dưới tên có 2 nhãn, thứ tự: "KM 50.000 - test" rồi "CTKM-A … (63.500)"
And Thành tiền gạch 685.000, ghi 571.500
And Còn phải thu = Thành tiền các dòng − Khuyến mại hóa đơn, khớp amountAfterPromotion của evaluate
```

**AC-05** — Dòng bị CTKM chiếm hết thì không có nhãn CTKM hóa đơn
```gherkin
Given giỏ chỉ có SKU-685 với CTKM-A đang áp, CTKM-B bị bỏ qua CONDITION_NOT_MET
When màn hình hiển thị
Then dòng SKU-685 chỉ có nhãn CTKM-A, không có nhãn CTKM-B
And panel phải không có dòng Khuyến mại (xem AC-07)
```

**AC-06** — Thu ngân bỏ CTKM trong modal thì nhãn biến mất theo
```gherkin
Given dòng SKU-685 đang có nhãn CTKM-A
When thu ngân bỏ tick CTKM-A trong modal "Chương trình khuyến mãi" (EXCLUDED_BY_CASHIER)
Then nhãn CTKM-A biến mất, Thành tiền về 685.000 không gạch
And Còn phải thu tăng đúng 68.500
```

---

## US-02 — Dòng "Khuyến mại" ở panel phải chỉ nói về khuyến mãi trên hóa đơn

Là thu ngân, tôi muốn *Tổng tiền* là tổng các dòng đã giảm và dòng *Khuyến mại*
chỉ là phần giảm trên cả hóa đơn, để hai con số đọc được ngay mà không phải cộng
trừ trong đầu.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-07** — Không có CTKM hóa đơn thì không có dòng Khuyến mại [ẢNH]
```gherkin
Given giỏ chỉ có SKU-685 với CTKM-A (hàng hóa) đang áp
When panel phải hiển thị
Then Tổng tiền = 616.500 (đã trừ CTKM hàng hóa)
And không có dòng "Khuyến mại"
And Còn phải thu = 616.500
```

**AC-08** — Có CTKM hóa đơn thì dòng Khuyến mại chỉ mang phần hóa đơn [ẢNH]
```gherkin
Given giỏ SKU-685 + SKU-100, CTKM-A và CTKM-B cùng áp
When panel phải hiển thị
Then Tổng tiền = 716.500 (785.000 − 68.500)
And dòng "Khuyến mại (10%)" = −10.000
And Còn phải thu = 706.500 — không đổi so với trước feature
```

**AC-09** — Tổng tiền luôn bằng tổng cột Thành tiền
```gherkin
Given bất kỳ giỏ nào (kể cả có giảm tay)
When panel phải hiển thị
Then Tổng tiền = Σ Thành tiền của các dòng đang hiển thị
And Còn phải thu = Tổng tiền − Khuyến mại − Đổi điểm − Đặt cọc (+ Phí đổi trả) như logic hiện tại
```

**AC-10** — Nút ✕ trên dòng Khuyến mại chỉ bỏ CTKM hóa đơn (A-04)
```gherkin
Given giỏ SKU-685 + SKU-100, CTKM-A và CTKM-B cùng áp
When thu ngân bấm ✕ cạnh "Khuyến mại" và xác nhận
Then hộp xác nhận chỉ nêu tên CTKM-B
And sau xác nhận: dòng Khuyến mại biến mất, nhãn CTKM-A trên SKU-685 vẫn còn, Còn phải thu = 716.500
```

---

## US-03 — Hóa đơn in lúc bán mang cùng thông tin trên từng dòng

Là khách hàng, tôi muốn hóa đơn (tạm tính và hóa đơn thật) ghi từng món được
chương trình nào giảm bao nhiêu, để đối chiếu với giá niêm yết.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-11** — In tạm tính: nhãn dưới tên và Thành tiền sau CTKM hàng hóa (A-05, A-12)
```gherkin
Given giỏ SKU-685 + SKU-100, CTKM-A và CTKM-B cùng áp
When bấm "In tạm tính"
Then dòng SKU-685 in: tên, dưới tên "CTKM-A … (68.500)", ĐG 685.000, TT 616.500
And dòng SKU-100 in: dưới tên "CTKM-B … (10.000)", ĐG 100.000, TT 100.000
And khối tổng giữ nguyên: Tiền hàng 785.000, Khuyến mãi 78.500, KM theo mặt hàng 68.500, KM theo hóa đơn 10.000, Tổng thanh toán 706.500
```

**AC-12** — Hóa đơn in sau Thu tiền giống hệt tạm tính về nhãn và số
```gherkin
Given cùng giỏ, "In hóa đơn" bật
When Thu tiền thành công
Then HTML hóa đơn in có cùng nhãn và cùng Thành tiền từng dòng như AC-11
```

**AC-13** — Giảm tay + CTKM trên cùng dòng in đủ hai nhãn
```gherkin
Given dòng SKU-685 có giảm tay 50.000 và CTKM-A
When in tạm tính
Then dưới tên có "KM 50.000 - test" và "CTKM-A … (63.500)", TT 571.500
And dòng "Giảm giá" (tay) 50.000 và "KM theo mặt hàng" 63.500 đều có ở khối tổng
```

---

## US-04 — Hóa đơn đã lưu: in lại và xem chi tiết đọc từ snapshot

Là kế toán, tôi muốn in lại hóa đơn cũ hay mở chi tiết vẫn thấy đúng CTKM đã
giảm từng dòng lúc bán, để không ai phải tính lại hay đoán.

**Priority:** must
**Depends on:** US-03

### Acceptance criteria

**AC-14** — `GET /invoices/:id` trả tên và phân bổ dòng của CTKM đã chạy (A-06) [DB]
```gherkin
Given hóa đơn 2609180003 (paid) có 2 dòng invoice_checkout_promotions
When gọi GET /invoices/2609180003-id
Then appliedPromotions có 2 phần tử, mỗi phần tử có programId, code, name, type, discountAmount, lineDiscounts[]
And lineDiscounts của KM000003 = [{ lineId: <invoice_items.id của SKU-685>, discountAmount: 68500, unitPriceAfter: 616500 }]
And lineDiscounts của KM000004 = [{ lineId: <id của SKU-100>, discountAmount: 10000, unitPriceAfter: 90000 }]
And hóa đơn không có snapshot (bán trước khi có CTKM) trả appliedPromotions = []
```

**AC-15** — Panel chi tiết hóa đơn (InvoiceReceiptDialog) vẽ nhãn từng dòng (A-07)
```gherkin
Given mở chi tiết hóa đơn 2609180003 từ danh sách HĐ
When dialog hiển thị các dòng
Then dòng SKU-685 có nhãn "CTKM-A … (68.500)" và Thành tiền 616.500
And dòng SKU-100 có nhãn "CTKM-B … (10.000)" và Thành tiền 100.000
```

**AC-16** — In lại từ chi tiết hóa đơn cho ra cùng dòng như lúc bán
```gherkin
Given dialog chi tiết hóa đơn 2609180003 đang mở
When bấm In
Then HTML in có cùng nhãn và Thành tiền từng dòng như AC-11, đọc từ appliedPromotions của response — không gọi /v2/promotions/evaluate
```

---

## US-05 — Không phá gì đang chạy

**Priority:** must
**Depends on:** US-01..04

**AC-17** — Hồi quy
```gherkin
Given bộ test API hiện tại (promotion, checkout-saga, pos invoice) đang xanh
When chạy pnpm --filter @erp/api test và test:e2e -- promotion|invoice
Then không ca nào từ xanh sang đỏ
And pnpm openapi:generate chỉ thêm field mới vào AppliedInvoicePromotionDto, không đổi/xóa gì khác
And pos-web tsc --noEmit xanh
```
