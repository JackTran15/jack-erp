---
feature: quick-exchange-line-discount
stories: 3
acceptance_criteria: 10
---

# Requirements — KM theo dòng trên đơn đổi trả nhanh

## US-01 — Tất toán đơn đổi trả nhanh có KM theo dòng

Là thu ngân POS, tôi muốn đơn đổi trả nhanh có khuyến mại theo dòng thu đúng phần chênh
hiển thị trên màn hình, để khách lẻ không bị chặn bởi lỗi công nợ.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Đổi trả nhanh, dòng mua thêm có KM, khách lẻ

```gherkin
Given tôi mở tab đổi trả nhanh, không chọn khách hàng và không có hoá đơn gốc
And giỏ trả có TH9864-K-37 số lượng 1 đơn giá 460.000, không KM
And giỏ mua thêm có AK29011-XA-36 số lượng 1 đơn giá 685.000 với KM 30% lý do "sale30"
And màn hình hiển thị "Còn phải thu" 19.500
When tôi nhập 19.500 tiền mặt và bấm Thanh toán
Then hoá đơn được phát hành với status "paid"
And invoices.net_amount = 19.500
And dòng OUT lưu line_total = 479.500, line_discount = 205.500, line_discount_type = "percent", line_discount_value = 30, line_discount_reason = "sale30"
And không có lỗi "Ghi phần chênh đổi hàng vào công nợ yêu cầu invoice có customerId"
```

**AC-02** — KM nằm trên dòng hàng trả

```gherkin
Given tôi mở tab đổi trả nhanh không có hoá đơn gốc
And giỏ trả có một dòng đơn giá 500.000 với KM 10% (50.000)
And giỏ mua thêm có một dòng đơn giá 600.000 không KM
When tôi tất toán
Then dòng IN lưu line_total = 450.000 kèm đủ ba cột line_discount_type/value/reason
And invoices.net_amount = 150.000
```

**AC-03** — Phần chênh âm: hoàn tiền cho khách lẻ

```gherkin
Given tôi mở tab đổi trả nhanh không có hoá đơn gốc và không chọn khách hàng
And tổng hàng trả sau KM lớn hơn tổng hàng mua thêm sau KM 100.000
When tôi chọn hoàn tiền mặt và tất toán
Then hoá đơn phát hành thành công với refunded_amount = 100.000 và net_amount = -100.000
And hệ thống không đòi customerId
```

**AC-04** — Đơn trả hàng thuần có KM dòng

```gherkin
Given tôi mở tab trả hàng nhanh, giỏ mua thêm rỗng
And dòng trả có đơn giá 300.000 với KM số tiền 30.000
When tôi tất toán
Then dòng IN lưu line_total = 270.000
And số tiền hoàn cho khách là 270.000
```

**AC-05** — Đổi trả theo hoá đơn gốc không đổi hành vi hoàn tiền

```gherkin
Given một hoá đơn gốc đã bán có KM và tôi mở đổi trả theo đúng hoá đơn đó
When tôi trả một dòng của hoá đơn gốc
Then số tiền hoàn vẫn được prorate từ hoá đơn gốc qua refundableUnitValues như trước khi sửa
And giá trị hoàn không thay đổi so với hành vi hiện tại
```

## US-02 — Mở lại phiếu nháp đổi/trả đúng là đơn đổi/trả

Là thu ngân POS, khi mở lại một phiếu đổi trả còn dở trong "HĐ lưu tạm", tôi muốn nó về
đúng hai giỏ trả/mua như lúc bỏ dở, để không vô tình bán hàng trả như hàng mua.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-06** — Khôi phục phiếu nháp EXCHANGE

```gherkin
Given tồn tại một phiếu nháp type EXCHANGE trong phiên POS hiện tại, có 1 dòng IN và 1 dòng OUT có KM
When tôi mở dialog "HĐ lưu tạm" và chọn phiếu đó
Then một tab đổi trả nhanh được mở với dòng IN nằm ở giỏ Trả hàng và dòng OUT nằm ở giỏ Mua thêm
And KM theo dòng của dòng OUT hiển thị lại đúng như đã lưu
And không có dòng nào của giỏ trả bị đưa sang giỏ mua
```

**AC-07** — Khôi phục phiếu nháp RETURN

```gherkin
Given tồn tại một phiếu nháp type RETURN trong phiên POS hiện tại
When tôi mở dialog "HĐ lưu tạm" và chọn phiếu đó
Then tab mở ra ở chế độ trả hàng với toàn bộ dòng nằm ở giỏ Trả hàng
And giỏ Mua thêm rỗng
```

**AC-08** — Tất toán lại từ tab khôi phục

```gherkin
Given tôi đã khôi phục một phiếu nháp EXCHANGE thành tab đổi trả
When tôi bấm Thanh toán và tất toán thành công
Then yêu cầu đi qua POST /invoices/:id/checkout-return chứ không phải POST /invoices/:id/checkout
And phiếu nháp nguồn không còn xuất hiện trong dialog "HĐ lưu tạm"
```

## US-03 — Backend từ chối phát hành phiếu đổi/trả qua luồng bán thường

Là kế toán, tôi muốn một phiếu `type` EXCHANGE/RETURN không bao giờ được tất toán bằng
luồng bán hàng, để `net_amount` trên báo cáo không bao giờ lệch với số thực thu.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-09** — Chặn checkout sai loại

```gherkin
Given một phiếu nháp có type EXCHANGE hoặc RETURN
When client gọi POST /invoices/:id/checkout trên phiếu đó
Then API trả 400 với code INVOICE_NOT_CHECKOUTABLE
And phiếu vẫn giữ nguyên is_draft = true, status = DRAFT, không được cấp số chứng từ
```

**AC-10** — Đơn bán thường không bị ảnh hưởng

```gherkin
Given một phiếu nháp có type SALE
When client gọi POST /invoices/:id/checkout với thanh toán hợp lệ
Then hoá đơn được phát hành như trước khi sửa
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Hợp đồng API | Field KM mới trên `ReturnInvoiceLineDto` là `@IsOptional()`; chạy lại `pnpm openapi:generate` và commit `schema.ts` + `openapi.snapshot.json` | T-01-02 |
| Không migration | Không thêm/đổi cột DB — ba cột `line_discount_*` đã tồn tại trên `invoice_items` | T-01-03 |
| Ngôn ngữ | Chuỗi lỗi phía BE bằng tiếng Anh; mọi chuỗi hiển thị POS bằng tiếng Việt | T-03-01 |
| Không hồi quy | Luồng SALE (`InvoiceService.create/update`) giữ nguyên hành vi tính KM dòng khi tách util dùng chung | T-01-01 |
