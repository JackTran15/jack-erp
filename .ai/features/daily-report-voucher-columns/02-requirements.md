# Requirements — daily-report-voucher-columns

## US-01 — Thu tiền mặt liệt kê phiếu thu

Là kế toán quầy, tôi muốn modal "Tổng tiền mặt" liệt kê **phiếu thu** thay vì hoá đơn, để nó
trả lời cùng một câu hỏi với modal "Tổng chi tiền mặt" đang liệt kê phiếu chi.

**AC-01** — `revenue-cash` chỉ trả về dòng bắt nguồn từ `cash_receipts` đã POSTED
```gherkin
Given trong khoảng ngày có hoá đơn tiền mặt và có phiếu thu đã POSTED
When gọi POST /reports/pos/daily-summary/detail với category "revenue-cash"
Then mọi dòng trả về đều có documentNumber là số phiếu thu
And không có dòng nào mang mã INV- hoặc RTN-
```

**AC-02** — Phiếu thu `purpose = POS_SALE` không còn bị loại trừ
```gherkin
Given có một phiếu thu đã POSTED với purpose POS_SALE trong khoảng ngày
When gọi detail với category "revenue-cash"
Then phiếu thu đó xuất hiện trong danh sách
And số tiền của nó được cộng vào totals.amount
```

**AC-03** — `revenue-bank-transfer` giữ nguyên hành vi cũ
```gherkin
Given cùng bộ dữ liệu ở AC-01
When gọi detail với category "revenue-bank-transfer"
Then danh sách vẫn chứa dòng hoá đơn từ invoice_payments
And phiếu thu purpose POS_SALE vẫn bị loại trừ
```

## US-02 — Biết ai thu, ai chi

Là kế toán quầy, tôi muốn thấy nhân viên phụ trách trên từng phiếu, để đối chiếu ca trực mà
không phải mở từng chứng từ.

**AC-04** — Cột NV Thu trên modal Thu tiền mặt
```gherkin
Given một phiếu thu đã POSTED có staff_id trỏ tới một user
When mở modal "Tổng tiền mặt"
Then có cột tiêu đề "NV Thu" nằm ngay sau cột "Khách hàng"
And ô của dòng đó hiển thị họ tên người dùng ứng với staff_id
```

**AC-05** — Cột NV Chi trên modal Chi tiền mặt
```gherkin
Given một phiếu chi đã POSTED có staff_id trỏ tới một user
When mở modal "Tổng chi tiền mặt"
Then có cột tiêu đề "NV Chi" nằm ngay sau cột "Khách hàng"
And ô của dòng đó hiển thị họ tên người dùng ứng với staff_id
```

**AC-06** — `staff_id` NULL cho ô trống, không cho chuỗi rác
```gherkin
Given một phiếu chi đã POSTED có staff_id NULL (phiếu do consumer sinh)
When gọi detail với category "expense-cash"
Then dòng đó không có staffName (undefined), không phải chuỗi rỗng ghép từ tên rỗng
```

**AC-07** — "Khách hàng" lấy từ phiếu, có đường lui sang snapshot
```gherkin
Given một phiếu thu có payer_name NULL nhưng partner_name_snapshot có giá trị
When gọi detail với category "revenue-cash"
Then customerName của dòng đó bằng partner_name_snapshot
```

## US-04 — Loại chứng từ nói đúng dòng tiền đó là gì

Là kế toán quầy, tôi muốn cột "Loại chứng từ" phân biệt được các dòng phiếu thu, thay vì gộp
gần hết vào "Thu khác".

**AC-10** — Phiếu thu `POS_SALE` lấy nhãn từ loại hoá đơn nguồn
```gherkin
Given một phiếu thu POSTED có purpose POS_SALE, referenceType INVOICE, referenceId trỏ tới một hoá đơn
When gọi detail với category "revenue-cash"
Then documentType của dòng đó bằng nhãn của invoices.type: SALE → "Bán hàng", RETURN → "Đổi trả", EXCHANGE → "Đổi trả, mua thêm"
```

**AC-11** — Phiếu thu do huỷ phiếu trả hàng có nhãn riêng
```gherkin
Given một phiếu thu POSTED có referenceType RETURN_CANCEL
When gọi detail với category "revenue-cash"
Then documentType của dòng đó bằng "Huỷ trả hàng"
And không còn rơi vào "Thu khác"
```

**AC-12** — Nhãn suy ra từ dữ liệu có cấu trúc, không phải từ `reason`
```gherkin
Given một phiếu thu có reason bị sửa thành chuỗi bất kỳ
When gọi detail với category "revenue-cash"
Then documentType không đổi, vì nó suy từ purpose/referenceType/invoices.type
```

**AC-13** — Phiếu thu trỏ tới hoá đơn ngoài cửa sổ ngày vẫn có nhãn
```gherkin
Given một phiếu thu có voucherDate nằm trong khoảng lọc nhưng hoá đơn nguồn có issuedAt nằm ngoài
When gọi detail với category "revenue-cash"
Then dòng đó vẫn lấy được nhãn từ loại hoá đơn nguồn, không rơi về "Thu khác"
```

**AC-14** — Dropdown có thêm lựa chọn mới
```gherkin
Given modal "Tổng tiền mặt" đang mở
When mở dropdown "Loại chứng từ"
Then có lựa chọn "Huỷ trả hàng"
```

## US-03 — Không phá thứ đang chạy

**AC-08** — Dropdown "Loại chứng từ" giữ nguyên 7 lựa chọn
```gherkin
Given modal "Tổng tiền mặt" đang mở
When mở dropdown "Loại chứng từ"
Then vẫn có đủ Tất cả, Bán hàng, Đổi trả, "Đổi trả, mua thêm", Hoàn tiền mặt, Thu nợ, Thu khác
```

**AC-09** — Handler tổng hợp không đổi
```gherkin
Given cùng bộ dữ liệu ở AC-01
When gọi POST /reports/pos/daily-summary
Then revenue.cash giữ nguyên giá trị như trước thay đổi
```
