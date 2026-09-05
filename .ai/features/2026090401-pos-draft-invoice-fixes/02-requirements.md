---
feature: pos-draft-invoice-fixes
stories: 3
acceptance_criteria: 13
---

# Requirements — Hoá đơn lưu tạm

## US-01 — Mở lại phiếu lưu tạm với đúng số tiền đã nhập

Là thu ngân, tôi muốn phiếu lưu tạm mở lại giữ nguyên số tiền tôi đã nhập lúc lưu,
để không phải gõ lại tiền cho từng phiếu treo.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Giữ đúng số tiền một dòng
```gherkin
Given tôi có giỏ hàng 595.000 và dòng "Tiền mặt" đang là 595.000
When tôi bấm "Lưu tạm (F10)" rồi mở lại phiếu đó từ "HĐ lưu tạm"
Then dòng "Tiền mặt" của tab mới hiện 595.000
And "Trả lại khách" hiện 0
```

**AC-02** — Giữ đủ nhiều dòng thanh toán
```gherkin
Given tôi chia tiền thành "Tiền mặt" 300.000 và "Chuyển khoản" 295.000
When tôi lưu tạm rồi mở lại phiếu đó
Then tab mới có đúng hai dòng thanh toán với số tiền và phương thức như lúc lưu
And mỗi dòng giữ tài khoản nhận tiền đã chọn
```

**AC-03** — Phiếu nháp cũ không có dữ liệu thanh toán
```gherkin
Given một phiếu nháp được lưu trước thay đổi này nên không kèm dòng thanh toán
When tôi mở lại phiếu đó
Then tab mới hiện một dòng "Tiền mặt" bằng "Còn phải thu"
And không có lỗi nào hiện trên màn hình
```

**AC-04** — Sửa giỏ sau khi mở lại thì tiền bám theo tổng mới
```gherkin
Given tôi vừa mở lại một phiếu lưu tạm 595.000 với dòng "Tiền mặt" 595.000
When tôi thêm một mặt hàng 100.000 vào giỏ
Then "Còn phải thu" hiện 695.000
And dòng "Tiền mặt" hiện 695.000
```

**AC-05** — Số tiền gõ tay sống sót khi mở lại
```gherkin
Given tôi đã sửa dòng "Tiền mặt" thành 600.000 trên giỏ 595.000 rồi bấm "Lưu tạm (F10)"
And hàng trong phiếu không dính chương trình khuyến mại nào
When tôi mở lại chính phiếu đó
Then dòng "Tiền mặt" hiện 600.000, không bị ghi đè về 595.000
```

> Giới hạn đã biết, phát hiện lúc dựng T-01-05: **khuyến mại KHÔNG được lưu trên phiếu
> nháp** (nằm ngoài phạm vi, xem `00-intent.md`). Mở lại phiếu là CTKM được tính lại và
> tổng đổi thật, nên số tiền bám theo tổng mới — đúng luật sẵn có "số gõ tay giữ tới khi
> tổng đổi lần kế". Đây là hành vi đúng chứ không phải lỗi: 600.000 vốn được gõ cho một
> tổng khác. Vì vậy AC-05 khoanh vào phiếu không có CTKM.

## US-02 — Không bị cảnh báo tồn giả trên phiếu mở lại

Là thu ngân, tôi muốn phiếu mở lại chỉ cảnh báo khi hàng thật sự thiếu,
để tôi còn tin được cảnh báo khi nó xuất hiện.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-06** — Hàng còn đủ tồn thì đi thẳng
```gherkin
Given phiếu lưu tạm chứa 1 mặt hàng mà chi nhánh còn tồn bán được ≥ 1
When tôi mở lại phiếu đó và bấm "Thu tiền (F9)"
Then dòng hàng không có icon cảnh báo
And không hiện dialog "Cảnh báo xuất quá số lượng tồn"
```

**AC-07** — Hàng thiếu tồn thì vẫn cảnh báo
```gherkin
Given phiếu lưu tạm chứa 3 đơn vị của mặt hàng mà chi nhánh chỉ còn tồn bán được 1
When tôi mở lại phiếu đó
Then dòng hàng hiện cảnh báo "Hàng hóa quá số lượng tồn"
And bấm "Thu tiền (F9)" hiện dialog "Cảnh báo xuất quá số lượng tồn" với đúng dòng đó
```

**AC-08** — Hàng không có bản ghi tồn ở chi nhánh
```gherkin
Given phiếu lưu tạm chứa một mặt hàng không có bản ghi tồn nào tại chi nhánh đang bán
When tôi mở lại phiếu đó
Then dòng hàng hiện cảnh báo "Chưa xác định được tồn kho"
```

**AC-09** — Khôi phục trong lúc catalog chưa tải xong
```gherkin
Given catalog chi nhánh đang tải
When tôi mở lại một phiếu lưu tạm có hàng còn tồn
Then sau khi catalog tải xong, dòng hàng hết cảnh báo mà không cần tôi thao tác gì thêm
```

## US-03 — "DS hoá đơn" chỉ liệt kê hoá đơn thật

Là quản lý cửa hàng, tôi muốn màn "DS hoá đơn" không lẫn phiếu nháp,
để tổng cuối bảng đọc được ngay mà không phải tự trừ.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-10** — Không còn dòng Nháp
```gherkin
Given chi nhánh có 3 phiếu lưu tạm và 1 hoá đơn đã thanh toán trong hôm nay
When tôi mở "DS hoá đơn" với bộ lọc "Ngày tạo / Hôm nay" và trạng thái "Tất cả"
Then bảng chỉ hiện 1 dòng, là hoá đơn đã thanh toán
And không có dòng nào mang trạng thái "Nháp"
```

**AC-11** — Tổng và số kết quả khớp với dòng hiển thị
```gherkin
Given cùng dữ liệu như AC-10
When tôi đọc dòng "Tổng tiền" và ô đếm kết quả cuối bảng
Then "Tổng tiền" bằng tổng "Tổng thanh toán" của các dòng đang hiện
And ô đếm hiện "1-1/1 kết quả"
```

**AC-12** — Các trạng thái khác không bị ẩn lây
```gherkin
Given chi nhánh có hoá đơn ở các trạng thái đã thanh toán, ghi nợ, nợ một phần, chờ xử lý và đã huỷ
When tôi mở "DS hoá đơn" với trạng thái "Tất cả"
Then cả năm hoá đơn đó đều hiện
```

**AC-13** — Dialog "HĐ lưu tạm" không bị lọc lây
```gherkin
Given chi nhánh có 3 phiếu lưu tạm
When tôi mở dialog "Hóa đơn chưa thanh toán" từ nút "HĐ lưu tạm"
Then dialog liệt kê đủ 3 phiếu
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Contract | Lọc nháp nằm trong đúng query sẵn có của `/v2/invoices/search` — không thêm request, không lọc sau phân trang | T-03-01 |
| Compat | Phiếu nháp lưu trước thay đổi vẫn mở lại được, không cần backfill dữ liệu | T-01-04 |
| Convention | Source backend không chứa tiếng Việt; chuỗi UI mới (nếu có) là tiếng Việt | T-03-01 |
