# Requirements — voucher-party-person-columns

Ký hiệu dùng chung trong mọi kịch bản:

- **đối tượng** = `partner_name_snapshot` (tên đối tác, đóng băng lúc ghi sổ).
- **người** = `cash_receipts.payer_name` / `cash_payments.payee_name` /
  `bank_receipts.payer_name` / `bank_payments.payee_name`.

## US-01 — Lưới Thu chi tiền mặt tách đối tượng khỏi người

**AC-01** — Phiếu có đủ hai trường thì hiện đủ hai cột
```gherkin
Given một phiếu chi tiền mặt có partner_name_snapshot = "kkkk" và payee_name = "123123"
When mở Quỹ tiền > Thu chi tiền mặt
Then dòng của phiếu đó có cột "Đối tượng nộp/nhận" = "kkkk"
And có cột "Người nộp/nhận" = "123123"
```

**AC-02** — Không có người thì cột Người trống, cột Đối tượng KHÔNG bị kéo sang
```gherkin
Given một phiếu thu tiền mặt có partner_name_snapshot = "Công ty ABC" và payer_name rỗng
When mở lưới Thu chi tiền mặt
Then cột "Đối tượng nộp/nhận" = "Công ty ABC"
And cột "Người nộp/nhận" rỗng
```

**AC-03** — Không có đối tượng thì cột Đối tượng trống (chứng minh đã bỏ fallback)
```gherkin
Given một phiếu chi tiền mặt có partner_name_snapshot rỗng và payee_name = "Trần Văn B"
When mở lưới Thu chi tiền mặt
Then cột "Đối tượng nộp/nhận" rỗng
And cột "Người nộp/nhận" = "Trần Văn B"
```

**AC-04** — Lọc cột Đối tượng không bắt trúng tên người
```gherkin
Given phiếu ở AC-03 (chỉ có payee_name = "Trần Văn B")
When lọc cột "Đối tượng nộp/nhận" chứa "Trần Văn B"
Then kết quả trả về 0 dòng
```

**AC-05** — Lọc cột Người hoạt động độc lập
```gherkin
Given phiếu ở AC-01
When lọc cột "Người nộp/nhận" chứa "123123"
Then phiếu đó nằm trong kết quả
And khi lọc cột "Người nộp/nhận" chứa "kkkk" thì kết quả trả về 0 dòng
```

## US-02 — Lưới Thu chi tiền gửi tách đối tượng khỏi người

**AC-06** — Hai cột trên lưới tiền gửi
```gherkin
Given một phiếu chi tiền gửi có partner_name_snapshot = "kkkk" và payee_name = "123123"
When mở Quỹ tiền > Thu chi tiền gửi
Then cột "Đối tượng nộp/nhận" = "kkkk" và cột "Người nộp/nhận" = "123123"
```

**AC-07** — Bỏ fallback ở cả hai nhánh UNION của tiền gửi
```gherkin
Given một phiếu thu tiền gửi chỉ có payer_name = "Lê Thị C"
And một phiếu chi tiền gửi chỉ có partner_name_snapshot = "Nhà cung cấp D"
When mở lưới Thu chi tiền gửi
Then dòng phiếu thu có cột Đối tượng rỗng và cột Người = "Lê Thị C"
And dòng phiếu chi có cột Đối tượng = "Nhà cung cấp D" và cột Người rỗng
```

**AC-08** — Lọc độc lập trên lưới tiền gửi
```gherkin
Given phiếu thu ở AC-07 (chỉ có payer_name = "Lê Thị C")
When lọc cột "Đối tượng nộp/nhận" chứa "Lê Thị C"
Then kết quả trả về 0 dòng
```

## US-03 — Sổ quỹ tiền mặt tách đối tượng khỏi người

**AC-09** — Hai cột trên sổ quỹ tiền mặt, không đụng cột nhân viên
```gherkin
Given một phiếu chi tiền mặt đã ghi sổ có partner_name_snapshot = "kkkk", payee_name = "123123"
And staff_id trỏ tới nhân viên "Nguyễn Nhựt Hào"
When mở Quỹ tiền > Sổ quỹ tiền mặt trong kỳ chứa phiếu đó
Then dòng đó có cột "Đối tượng nộp/nhận" = "kkkk"
And có cột "Người nộp/nhận" = "123123"
And cột "Đối tượng thu/chi" vẫn = "Nguyễn Nhựt Hào"
```

**AC-10** — Sổ quỹ tiền mặt bỏ fallback (thứ tự COALESCE cũ ưu tiên đối tượng)
```gherkin
Given một phiếu thu tiền mặt đã ghi sổ chỉ có payer_name = "Trần Văn B"
When mở Sổ quỹ tiền mặt trong kỳ chứa phiếu đó
Then cột "Đối tượng nộp/nhận" rỗng và cột "Người nộp/nhận" = "Trần Văn B"
```

**AC-11** — Lọc độc lập trên sổ quỹ tiền mặt
```gherkin
Given phiếu ở AC-10
When lọc cột "Đối tượng nộp/nhận" chứa "Trần Văn B"
Then kết quả trả về 0 dòng
```

## US-04 — Sổ tiền gửi tách đối tượng khỏi người

**AC-12** — Hai cột trên sổ tiền gửi, không đụng cột "Nhân viên"
```gherkin
Given một phiếu chi tiền gửi đã ghi sổ có partner_name_snapshot = "kkkk" và payee_name = "123123"
When mở Quỹ tiền > Sổ tiền gửi trong kỳ chứa phiếu đó
Then dòng đó có cột "Đối tượng" = "kkkk" và cột "Người nộp/nhận" = "123123"
And cột "Nhân viên" giữ nguyên giá trị cũ
```

**AC-13** — Sổ tiền gửi coalesce đúng nhánh chứng từ
```gherkin
Given một phiếu thu tiền gửi chỉ có payer_name = "Lê Thị C" ở một dòng sổ
And một phiếu chi tiền gửi chỉ có partner_name_snapshot = "Nhà cung cấp D" ở dòng sổ khác
When mở Sổ tiền gửi
Then dòng phiếu thu có Đối tượng rỗng, Người = "Lê Thị C"
And dòng phiếu chi có Đối tượng = "Nhà cung cấp D", Người rỗng
```

## US-05 — Xuất khẩu Excel khớp lưới

**AC-14** — File Excel của lưới Thu chi tiền mặt có đủ hai cột, đúng thứ tự lưới
```gherkin
Given lưới Thu chi tiền mặt đang lọc ra phiếu ở AC-01
When bấm "Xuất khẩu"
Then file .xlsx tải về có cột "Đối tượng nộp/nhận" và cột "Người nộp/nhận" liền kề
And giá trị hai cột đó khớp đúng những gì lưới đang hiện
```

## US-06 — Hợp đồng API không lệch client

**AC-15** — Client sinh lại chứa trường mới
```gherkin
Given DTO tìm kiếm của 4 endpoint đã thêm trường người nộp/nhận
When chạy `pnpm openapi:generate` từ build riêng ở :4100
Then packages/api-client/src/generated/schema.ts chứa trường mới ở cả 4 schema
And openapi.snapshot.json cập nhật cùng lượt
```
