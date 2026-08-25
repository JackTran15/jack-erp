---
feature: pos-invoice-list-customer-and-layout
stories: 3
acceptance_criteria: 11
---

# Requirements — Danh sách hoá đơn POS: khách hàng inline + hết tràn layout

## US-01 — Thông tin khách đến từ chính API danh sách

Là thu ngân POS, tôi muốn trang Danh sách hoá đơn tải xong trong **một** lượt gọi API,
để mở trang và lật trang ở 100 dòng/trang không phải chờ một chùm request nối đuôi.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Một request cho một trang
```gherkin
Given tôi đang ở chi nhánh có ≥ 50 hoá đơn gắn khách trong hôm nay
And tôi để 100 dòng/trang
When tôi mở trang /invoices và chờ lưới hiện xong
Then tab Network có đúng 1 request POST /v2/invoices/search
And không có request nào tới GET /customers/<uuid>
```

**AC-02** — Ba cột khách vẫn hiện đúng
```gherkin
Given hoá đơn INV-202608-01006 gắn khách có mã KH792650, tên "chị vy", SĐT 09xxxxxxxx
When trang /invoices hiện dòng của hoá đơn đó
Then cột "Mã khách hàng" hiện KH792650
And cột "Khách hàng" hiện "chị vy"
And cột "Số điện thoại" hiện đúng SĐT của khách đó
```

**AC-03** — Hoá đơn khách lẻ để trống, không lỗi
```gherkin
Given hoá đơn INV-202608-01007 không gắn khách (customerId = null)
When trang /invoices hiện dòng của hoá đơn đó
Then ba cột khách để trống
And không có toast lỗi nào hiện lên
```

**AC-04** — Payload không mang PII ngoài bốn trường
```gherkin
Given tôi đọc response của POST /v2/invoices/search trong tab Network
When tôi mở một phần tử bất kỳ của data[] có customer khác null
Then customer chỉ có đúng các khoá id, code, name, phone
And không có khoá nationalId, birthDate, address, taxCode, note hay email
```

**AC-05** — Lọc theo khách không đổi hành vi
```gherkin
Given lưới đang hiện hoá đơn của nhiều khách khác nhau
When tôi gõ "vy" vào ô lọc cột "Khách hàng" với toán tử "chứa"
Then lưới chỉ còn các hoá đơn có tên khách chứa "vy"
And dòng "Tổng tiền:" đổi theo đúng tập kết quả đã lọc, không phải tổng của trang
```

**AC-06** — Tổng cuối bảng không đổi
```gherkin
Given một bộ lọc bất kỳ đang áp dụng
When tôi so sánh giá trị "Tổng tiền:" trước và sau thay đổi này
Then hai giá trị bằng nhau
```

---

## US-02 — Thanh phân trang luôn nằm trong khung nhìn

Là thu ngân POS, tôi muốn nhìn thấy đủ thanh phân trang và dòng tổng tiền, để lật trang
và đổi số dòng/trang mà không phải thu nhỏ trình duyệt.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-07** — Đủ thanh phân trang ở desktop
```gherkin
Given khung nhìn 1440×900
When tôi mở /invoices với đủ dòng để lưới tràn
Then thanh phân trang hiện đủ: nút lật trang, chuỗi "x-y/z kết quả", ô chọn số dòng/trang
And dòng "Tổng tiền:" hiện đủ chiều cao, không bị cắt ngang
```

**AC-08** — Đủ thanh phân trang ở laptop thấp
```gherkin
Given khung nhìn 1440×720
When tôi mở /invoices với đủ dòng để lưới tràn
Then thanh phân trang vẫn hiện đủ và dòng "Tổng tiền:" không bị cắt
```

**AC-09** — Không trang nào của vỏ POS cao hơn phần vỏ chừa lại
```gherkin
Given tôi đang ở /invoices hoặc /return-goods
When tôi đo chiều cao container gốc của trang
Then nó nhỏ hơn hoặc bằng (chiều cao khung nhìn − chiều cao header PosLayout)
And phần thân trang không tạo thanh cuộn dọc ở cấp document
```

**AC-10** — Trang đổi trả giữ nguyên bố cục bên trong
```gherkin
Given khung nhìn 1440×720
When tôi mở /return-goods
Then bảng hoá đơn, ô tìm kiếm và thanh phân trang hiện đúng như trước, chỉ khác là không còn bị cắt đáy
```

---

## US-03 — Không còn đường N+1 nào để ai đó vô tình dùng lại

Là người bảo trì pos-web, tôi muốn nhánh fetch khách theo dòng biến mất khỏi codebase,
để lần sau không ai nối lại một lưới hoá đơn vào nó.

**Priority:** should
**Depends on:** US-01

### Acceptance criteria

**AC-11** — Hook cũ biến mất, build vẫn xanh
```gherkin
Given useInvoiceListQuery không còn importer nào
When tôi xoá hook đó khỏi use-query-invoice.ts cùng các import chỉ nó dùng
Then grep "customerService.get(" trong apps/pos-web/src không còn khớp trong use-query-invoice.ts
And pnpm --filter @erp/pos-web build chạy xanh
```
