---
feature: online-order-intake-dispatch
stories: 8
acceptance_criteria: 29
---

# Requirements — Nhận đơn web qua API key, Admin phân thủ công về chi nhánh

Ký hiệu **[DB]** = phải đọc từ bảng mới tin; **[API]** = chứng minh bằng request
thật; **[ẢNH]** = ảnh chụp có assert DOM.

Fixture xuyên suốt: tổ chức có ≥2 chi nhánh (`CN-A`, `CN-B`), một API key của
website công ty, một mặt hàng `SKU-500` giá niêm yết 500.000 còn tồn ở cả hai
chi nhánh, một tỉnh/phường có thật trong `geo_provinces`/`geo_wards`.

---

## US-01 — Website công ty đặt đơn qua API key

Là website bán hàng của công ty, tôi gửi đơn của khách vào ERP kèm địa chỉ giao
và nguồn đơn, để ERP là nơi duy nhất giữ đơn.

**Priority:** must · **Depends on:** —

### Acceptance criteria

**AC-01** — Đơn hợp lệ vào pool chưa phân [API][DB]
```gherkin
Given một API key hợp lệ của website công ty
When website POST một đơn 1 dòng SKU-500 × 2, kèm người nhận và địa chỉ giao
Then API trả 201 kèm mã chứng từ của đơn
And [DB] sales_orders có 1 dòng mới với branch_id IS NULL và status = 'SENT'
And đơn KHÔNG xuất hiện trên lưới đơn hàng của CN-A lẫn CN-B
```

**AC-02** — Địa chỉ giao phải là mã tỉnh/phường có thật (A-07) [API]
```gherkin
Given website gửi đơn với province_code và ward_code không tồn tại trong geo_*
When ERP nhận đơn
Then API trả 400 và không có dòng nào được ghi vào sales_orders
```

**AC-03** — Tên tỉnh/phường chốt trên đơn, không đọc lại từ geo_* (A-07) [DB]
```gherkin
Given một đơn đã tạo với ward_code W và tên phường lúc đó là "Phường X"
When dataset địa giới đổi tên phường W thành "Phường Y"
Then đơn cũ vẫn hiển thị "Phường X"
```

**AC-04** — Giá chốt tại thời điểm đặt
```gherkin
Given SKU-500 có selling_price = 500.000 lúc khách đặt
When quản trị đổi selling_price thành 600.000 sau đó
Then đơn đã đặt vẫn giữ đơn giá 500.000 trên dòng hàng
And hoá đơn phát hành từ đơn đó thu theo 500.000
```

**AC-05** — Không áp khuyến mãi cho đơn web
```gherkin
Given đang có một CTKM toàn chuỗi áp cho SKU-500
When website đặt đơn 2 × SKU-500
Then tổng tiền hàng của đơn = 1.000.000, không có dòng giảm giá chương trình nào
```

**AC-06** — Đối tác gửi lại cùng đơn không đẻ đơn thứ hai (A-02) [DB]
```gherkin
Given website đã gửi thành công một đơn với external_order_id = "WEB-1001"
When website gửi lại đúng external_order_id đó trên cùng kênh
Then ERP trả về đơn đã tạo, không tạo đơn thứ hai
And [DB] sales_orders chỉ có đúng 1 dòng mang external_order_id = "WEB-1001"
```

**AC-07** — API key thiếu quyền hoặc sai IP không tạo được đơn [API]
```gherkin
Given một API key không mang quyền đặt đơn, hoặc gọi từ IP ngoài whitelist
When gọi endpoint đặt đơn
Then API trả 401/403 và không ghi gì vào sales_orders
```

**AC-08** — Khách khớp theo số điện thoại, chưa có thì tạo (A-01) [DB]
```gherkin
Given SĐT người đặt đã tồn tại trên customers của tổ chức
When đơn được tạo
Then đơn trỏ tới đúng customer đó, không tạo khách trùng
And khi SĐT chưa tồn tại thì một customer mới được tạo và đơn trỏ vào nó
```

---

## US-02 — Admin phân đơn về chi nhánh

Là Admin điều phối, tôi thấy mọi đơn chưa phân của toàn chuỗi và chọn tay chi
nhánh xử lý, để đơn về đúng kho còn hàng.

**Priority:** must · **Depends on:** US-01

**AC-09** — Màn Điều phối chỉ chứa đơn chưa phân (A-03, A-19) [ẢNH]
```gherkin
Given có 3 đơn chưa phân và 2 đơn đã phân cho CN-A
When Admin mở màn Điều phối
Then lưới hiện đúng 3 đơn chưa phân, không có đơn nào của CN-A
```

**AC-10** — Phân đơn đẩy đơn về đúng chi nhánh [DB][ẢNH]
```gherkin
Given một đơn đang ở pool
When Admin phân nó cho CN-A
Then [DB] sales_orders.branch_id = CN-A, status vẫn 'SENT'
And đơn biến khỏi màn Điều phối
And đơn xuất hiện trên lưới đơn hàng của CN-A
And đơn KHÔNG xuất hiện trên lưới của CN-B
```

**AC-11** — Phân được cả khi chi nhánh chưa mở ca
```gherkin
Given CN-A không có ca POS nào đang mở
When Admin phân một đơn cho CN-A
Then thao tác thành công, không có lỗi NO_OPEN_SESSION
And không có hoá đơn nháp nào được tạo
```

**AC-12** — Lịch sử điều phối ghi lại ai phân, cho ai, lúc nào (A-06) [DB]
```gherkin
Given một đơn đã bị trả về pool một lần rồi được phân lại cho CN-B
When đọc lịch sử điều phối của đơn
Then có đủ cả hai lần phân và lần trả về, kèm người thực hiện, thời điểm và lý do trả
```

**AC-13** — Không có quyền điều phối thì không phân được (A-08) [API]
```gherkin
Given một thu ngân chi nhánh không có quyền điều phối
When gọi endpoint phân đơn
Then API trả 403 và branch_id của đơn không đổi
```

---

## US-03 — Admin xem toàn chuỗi và biết đơn đang ở chi nhánh nào

Là Admin, tôi cần một màn tra cứu thấy mọi đơn của chuỗi kèm chi nhánh đang giữ.

**Priority:** must · **Depends on:** US-02

**AC-14** — Màn Tất cả đơn hiện cột Chi nhánh (A-16, A-19) [ẢNH]
```gherkin
Given 1 đơn chưa phân, 1 đơn ở CN-A, 1 đơn ở CN-B
When Admin mở màn Tất cả đơn
Then lưới hiện đủ 3 đơn
And cột "Chi nhánh" ghi "(Chưa phân)", "CN-A", "CN-B" tương ứng
```

**AC-15** — Lọc theo chi nhánh trên màn Tất cả đơn [ẢNH]
```gherkin
When Admin lọc cột Chi nhánh = CN-A
Then chỉ còn đơn của CN-A trên lưới
```

---

## US-04 — Chi nhánh xử lý đơn được phân

Là thu ngân chi nhánh, tôi xử lý đơn Admin đẩy về thành hoá đơn và công nợ COD
khi đóng gói giao shipper.

**Priority:** must · **Depends on:** US-02

**AC-16** — Lưới chi nhánh chỉ có đơn của chính mình [ẢNH]
```gherkin
Given pool có đơn chưa phân, CN-B có đơn của CN-B
When thu ngân CN-A mở lưới đơn hàng
Then không thấy đơn nào trong pool và không thấy đơn nào của CN-B
```

**AC-17** — Xử lý đơn ra hoá đơn, trừ tồn, mở công nợ COD [DB]
```gherkin
Given CN-A đã mở ca và đang giữ một đơn 2 × SKU-500
When thu ngân xử lý đơn và hoàn tất thu ngân
Then [DB] một invoice được phát hành, tồn SKU-500 tại CN-A giảm 2
And [DB] invoice mang phí GH thu khách đúng bằng số ghi trên đơn (A-16)
And [DB] invoice.amount_due = tiền hàng phải thu + phí GH thu khách
And [DB] invoice_debts có 1 dòng OPEN bằng đúng amount_due đó, trỏ đúng customer của đơn
And [DB] sales_orders.status = 'PROCESSED' và invoice_id trỏ đúng hoá đơn
```

**AC-18** — Hoá đơn mang được nguồn đơn [DB]
```gherkin
When hoá đơn được phát hành từ một đơn web
Then [DB] invoices.sales_order_id trỏ về đơn
And [DB] invoices.sales_channel mang kênh của đơn, khác NULL
```

**AC-19** — Chưa mở ca thì không xử lý được, đơn giữ nguyên [API]
```gherkin
Given CN-A đang giữ một đơn nhưng không có ca nào mở
When thu ngân bấm xử lý đơn
Then API trả lỗi NO_OPEN_SESSION
And [DB] đơn vẫn branch_id = CN-A, status vẫn 'SENT', không có hoá đơn nháp nào
```

**AC-20** — Shipper nộp tiền thì công nợ COD tất toán [DB]
```gherkin
Given một đơn đã phát hành hoá đơn với công nợ COD OPEN
When kế toán ghi nhận khoản thu tất toán khoản nợ đó
Then [DB] invoice_debts.status = 'PAID' và remaining_amount = 0
```

---

## US-05 — Chi nhánh trả đơn về pool

Là thu ngân chi nhánh, tôi trả đơn về cho Admin kèm lý do khi không đáp ứng nổi,
thay vì huỷ đơn của khách.

**Priority:** must · **Depends on:** US-02

**AC-21** — Trả về pool, kèm lý do (A-05) [DB][ẢNH]
```gherkin
Given CN-A đang giữ một đơn chưa phát hành hoá đơn
When thu ngân trả đơn về kèm lý do "hết hàng"
Then [DB] branch_id IS NULL, status vẫn 'SENT'
And lý do "hết hàng" nằm trong lịch sử điều phối của đơn
And đơn xuất hiện lại trên màn Điều phối của Admin
```

**AC-22** — Đơn đã phát hành hoá đơn thì không trả về được [API]
```gherkin
Given một đơn đã ở status 'PROCESSED' với hoá đơn đã phát hành
When chi nhánh gọi trả đơn về
Then API từ chối và branch_id không đổi
```

---

## US-06 — Huỷ đơn và rollback

Là người dùng ERP, tôi huỷ một đơn hỏng và mọi thứ nó đã làm tự quay về như cũ.

**Priority:** must · **Depends on:** US-04

**AC-23** — Huỷ đơn chưa có hoá đơn không đụng tồn (A-14) [DB]
```gherkin
Given một đơn ở pool hoặc đã phân nhưng chưa phát hành hoá đơn
When người dùng ERP huỷ đơn kèm lý do
Then [DB] status = 'CANCELLED', cancel_reason được ghi
And không có bút toán kho nào phát sinh
```

**AC-24** — Huỷ đơn đã phát hành hoá đơn thì rollback trọn gói (A-15) [DB]
```gherkin
Given một đơn đã phát hành hoá đơn: tồn SKU-500 tại CN-A đã giảm 2, công nợ COD OPEN
When người dùng ERP huỷ đơn đó
Then [DB] tồn SKU-500 tại CN-A quay lại đúng số trước khi bán
And [DB] có bút toán kho đảo mang reference type INVOICE_CANCEL
And [DB] invoice_debts của hoá đơn đó không còn OPEN
And [DB] điểm tích của khách quay về số trước khi bán
And [DB] invoices.status = 'CANCELLED' và các cột tiền của hoá đơn KHÔNG bị sửa
And [DB] sales_orders.status = 'CANCELLED'
```

---

## US-07 — Phí giao hàng trên hoá đơn

Là kế toán, tôi cần phí giao thu của khách nằm trên hoá đơn để số shipper phải
thu bằng đúng tổng hoá đơn, không phải cộng tay.

**Priority:** must · **Depends on:** US-04

**AC-25** — Phí cộng SAU mọi khoản giảm, không bị chiết khấu ăn vào (A-22) [DB]
```gherkin
Given một hoá đơn tiền hàng 1.000.000, giảm giá 100.000, điểm tích giảm 50.000, phí GH 30.000
When công thức tính tổng chạy
Then amount_due = 1.000.000 − 100.000 − 50.000 + 30.000 = 880.000
And khi mọi khoản giảm vượt quá tiền hàng thì phần tiền hàng bị chặn ở 0
    và amount_due vẫn còn đúng 30.000 phí
```

**AC-26** — Ba nơi tính tổng vẫn khớp nhau [DB][ẢNH]
```gherkin
Given một hoá đơn có phí GH thu khách
When đọc "Tổng thanh toán" trên lưới hoá đơn POS, dòng tổng footer của lưới đó,
     và giá trị amount_due trong DB
Then cả ba bằng nhau
```
*Ghi chú:* `computeAmountDue` có hai bản sinh đôi — `invoiceSignedTotalSql`
(dùng cho cả filter lẫn `SUM()` của footer) và `getInvoiceSignedTotal` bên
`pos-web/src/lib/common/invoiceAmount.ts`. Comment trong code đã cảnh báo:
không có gì ép ba bản khớp nhau, sửa một phải sửa cả ba. AC này là cái chặn.

**AC-27** — Hoá đơn trả hàng / đổi hàng không mang phí giao (A-23) [DB]
```gherkin
Given một hoá đơn bán có phí GH 30.000
When khách trả hàng và một hoá đơn RETURN được lập
Then hoá đơn RETURN không mang phí GH nào
And số tiền hoàn cho khách không gồm 30.000 phí đó
```

---

## US-08 — Truy nguồn kênh và bộ cột lưới

Là kế toán và quản trị, tôi tách được doanh thu kênh web khỏi doanh thu tại quầy,
và lưới đơn không bày cột chưa có dữ liệu.

**Priority:** must · **Depends on:** US-04

**AC-28** — Thêm kênh mới không cần migration (A-02) [DB]
```gherkin
Given hệ thống đang chỉ có kênh "Website công ty"
When quản trị đăng ký thêm một kênh mới và cấp cho nó một API key
Then kênh mới đặt được đơn ngay
And không có migration nào phải chạy, không enum nào phải sửa
And báo cáo doanh thu tách được đơn của kênh mới khỏi kênh cũ và khỏi bán tại quầy
```

**AC-29** — Dialog cột bỏ 8 cột vận chuyển, giữ Thu hộ và Phí GH thu khách (A-20) [ẢNH]
```gherkin
When người dùng mở "Thiết lập cột hiển thị" trên lưới đơn hàng
Then không còn các mục ĐT giao hàng, Trạng thái ĐVVC, Mã vận đơn, Phí GH trả ĐT,
     Thông tin gói hàng, Phiếu đối soát, Trạng thái đối soát, Mã đơn hàng trên sàn
And vẫn còn "Thu hộ" và "Phí GH thu khách"
And cột "Thu hộ" hiển thị đúng bằng amount_due của hoá đơn (đã gồm phí)
```
