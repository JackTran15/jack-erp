---
feature: pos-variant-stock-columns
stories: 3
acceptance_criteria: 12
---

# Requirements — Hai cột tồn trong dialog chọn biến thể POS

## US-01 — Thu ngân thấy tồn ở các chi nhánh khác

Là thu ngân POS, tôi muốn nhìn thấy tổng tồn của một biến thể ở các chi nhánh khác ngay
trong dialog chọn size/màu, để trả lời khách "chi nhánh khác còn không" mà không phải
gọi điện hay mở backoffice.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Tổng tồn chi nhánh khác
```gherkin
Given tôi đang bán ở chi nhánh "Hồ Chí Minh"
And biến thể ABA2777-D-39 có tồn 3 ở "Hà Nội - Showroom", 5 ở "Kho lưu trữ HN" và 2 ở "CCC - Showroom"
When tôi mở dialog chọn biến thể của product ABA2777
Then dòng ABA2777-D-39 hiện cột "Tồn cửa hàng khác" = 10
```

**AC-02** — Loại trừ chi nhánh đang bán
```gherkin
Given tôi đang bán ở chi nhánh "Hồ Chí Minh"
And biến thể ABA2777-D-39 có tồn 7 nằm trong các kho của chính "Hồ Chí Minh"
And không chi nhánh nào khác có tồn của biến thể này
When tôi mở dialog chọn biến thể
Then cột "Tồn cửa hàng khác" của dòng đó hiện 0
```

**AC-03** — Chỉ đếm chi nhánh đang hoạt động
```gherkin
Given chi nhánh "CCC" có status SUSPENDED và đang giữ tồn 4 của biến thể ABA2777-D-39
And chi nhánh "Hà Nội" có status ACTIVE và đang giữ tồn 3 của cùng biến thể
When tôi mở dialog chọn biến thể ở chi nhánh "Hồ Chí Minh"
Then cột "Tồn cửa hàng khác" hiện 3
```

**AC-04** — Không rò dữ liệu sang tổ chức khác
```gherkin
Given một tổ chức khác cũng có item cùng mã và đang giữ tồn
When tôi mở dialog chọn biến thể
Then cột "Tồn cửa hàng khác" chỉ cộng tồn của các chi nhánh thuộc organizationId của tôi
```

**AC-05** — Không có gì để cộng
```gherkin
Given tổ chức của tôi chỉ có duy nhất một chi nhánh đang hoạt động
When tôi mở dialog chọn biến thể
Then mọi dòng hiện cột "Tồn cửa hàng khác" = 0
And dialog không báo lỗi
```

## US-02 — Thu ngân thấy tồn showroom hiện tại và hàng đang nằm ở kho nào

Là thu ngân POS, tôi muốn cột "Tồn kho" nói đúng lượng hàng đang ở quầy, và hover ra
được danh sách từng kho của chi nhánh, để biết nên bán ngay hay gọi kho lấy hàng.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-06** — Tồn kho = số dư thô kho showroom chính
```gherkin
Given kho showroom chính của chi nhánh tôi đang giữ số dư 2 của biến thể ABA2777-D-39
And "Kho lưu trữ HCM" của cùng chi nhánh đang giữ 5 của biến thể đó
When tôi mở dialog chọn biến thể
Then cột "Tồn kho" của dòng đó hiện 2
```

**AC-07** — Số âm được hiển thị nguyên trạng
```gherkin
Given kho showroom chính của chi nhánh tôi đang giữ số dư -1 của biến thể ABA2777-D-39
When tôi mở dialog chọn biến thể
Then cột "Tồn kho" của dòng đó hiện -1
And giá trị không bị kẹp về 0
```

**AC-08** — Hover phân rã theo kho
```gherkin
Given chi nhánh tôi có các kho đang hoạt động: "Showroom" (-1), "Kho lưu trữ" (2), "Kho hàng lỗi" (0)
When tôi rê chuột vào ô "Tồn kho" của dòng ABA2777-D-39
Then tooltip liệt kê đủ ba kho kèm số dư từng kho, gồm cả kho có tồn 0 và kho có tồn âm
```

**AC-09** — Chi nhánh chưa cấu hình showroom chính
```gherkin
Given chi nhánh tôi không có bản ghi showroom nào được đánh dấu là showroom chính
When tôi mở dialog chọn biến thể
Then cột "Tồn kho" hiện 0
And tooltip vẫn liệt kê đủ các kho đang hoạt động của chi nhánh kèm số dư
```

## US-03 — Cảnh báo vượt tồn không đổi hành vi

Là thu ngân POS, tôi muốn cảnh báo bán vượt tồn giữ đúng ngưỡng đã dùng lâu nay, để
việc đổi cách hiển thị không làm hàng đang ở kho tạm bị báo đỏ oan.

**Priority:** must
**Depends on:** US-02

### Acceptance criteria

**AC-10** — Ngưỡng cảnh báo vẫn là tồn showroom dự phóng
```gherkin
Given kho showroom chính đang giữ số dư 0 của biến thể ABA2777-D-39
And chi nhánh có 3 đơn vị của biến thể đó đã quét vào kho tạm để đưa ra quầy
When tôi tick chọn dòng đó và nhập số lượng 2
Then cột "Tồn kho" hiện 0
And dòng không hiện badge cảnh báo đỏ
```

**AC-11** — Cảnh báo vẫn bật khi thực sự vượt
```gherkin
Given tồn showroom dự phóng của biến thể ABA2777-D-39 là 1
When tôi tick chọn dòng đó và nhập số lượng 3
Then dòng hiện badge cảnh báo đỏ
And tooltip cảnh báo hiện "Tồn: 1"
```

**AC-12** — Không thêm round-trip khi mở dialog
```gherkin
Given tôi mở dialog chọn biến thể của một product
When dialog tải xong dữ liệu
Then chỉ có đúng một lời gọi `GET /pos/branches/:branchId/catalog/products/:id`
And cả "Tồn cửa hàng khác", "Tồn kho" lẫn dữ liệu tooltip đều nằm trong phản hồi đó
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Performance | Mở dialog không phát sinh thêm round-trip HTTP so với hiện tại; hai cột mới đi kèm payload `catalog/products/:id` (**AC-12**) | T-01-05 |
| Perf (backend) | Đường detail đọc `stock_balances` tối đa 2 lượt cho toàn bộ biến thể của product, cả hai đều hẹp theo `item_id IN (…)`; không N+1 theo biến thể hay theo chi nhánh | T-01-05 |
| Compat | `quantityOnHand`, `sellableQuantity`, `locations` giữ nguyên ngữ nghĩa cho mọi consumer hiện có | T-01-02 |
| i18n | Toàn bộ chuỗi mới trong tooltip là tiếng Việt; source backend tuyệt đối không chứa tiếng Việt | T-02-02 |
