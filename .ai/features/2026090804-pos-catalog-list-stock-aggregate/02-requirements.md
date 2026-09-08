---
feature: pos-catalog-list-stock-aggregate
stories: 2
acceptance_criteria: 8
---

# Requirements — pos-catalog-list-stock-aggregate

## US-01 — Lưới hàng hoá POS trả đúng số tồn như cũ, nhưng không quét cả kho

Là thu ngân, tôi muốn lưới sản phẩm ở màn bán hàng hiện đúng số tồn như trước,
để tôi không phải học lại con số nào — trong khi API thôi làm chậm các request khác.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Số tồn không đổi
```gherkin
Given một chi nhánh có tồn ở nhiều vị trí cho cùng một item
When gọi GET /pos/branches/:branchId/catalog/products
Then quantityOnHand của mỗi thẻ bằng đúng tổng đang trả ra hôm nay
And thẻ PRODUCT vẫn cộng tồn của mọi item biến thể thuộc nó
```

**AC-02** — Bỏ qua vị trí đã ngừng hoạt động
```gherkin
Given một item có tồn ở một location với is_active = false
When gọi GET /pos/branches/:branchId/catalog/products
Then phần tồn ở location đó không được cộng vào quantityOnHand
```

**AC-03** — Bỏ qua dòng đã ngừng theo dõi
```gherkin
Given một item có dòng stock_balances với is_tracked = false
When gọi GET /pos/branches/:branchId/catalog/products
Then dòng đó không được cộng vào quantityOnHand
```

**AC-04** — Item không có tồn
```gherkin
Given một item hiển thị trên POS nhưng không có dòng stock_balances nào ở chi nhánh
When gọi GET /pos/branches/:branchId/catalog/products
Then thẻ của nó vẫn xuất hiện với quantityOnHand = 0
```

**AC-05** — Lọc theo direction giữ nguyên ngữ nghĩa
```gherkin
Given chi nhánh có cả kho showroom lẫn kho thường
When gọi GET /pos/branches/:branchId/catalog/products?direction=SHOWROOM
Then chỉ tồn ở các storage được showrooms trỏ tới mới được cộng
When gọi với direction=WAREHOUSE
Then chỉ tồn ở các storage còn lại được cộng
And location có storage_id NULL được tính vào WAREHOUSE, không vào SHOWROOM
```

**AC-06** — Sắp xếp theo tồn vẫn đúng
```gherkin
Given nhiều thẻ có quantityOnHand khác nhau
When gọi với sortBy=quantityOnHand&sortOrder=desc
Then thứ tự thẻ giống hệt thứ tự đang trả ra hôm nay
```

## US-02 — Endpoint khác không còn bị kéo chậm theo

Là người dùng POS/backoffice, tôi muốn các request nhẹ trả về nhanh kể cả khi ai đó
vừa mở lưới hàng hoá, để màn hình không đứng hình vì một endpoint không liên quan.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-07** — Chi phí nạp tồn của đường list giảm
```gherkin
Given chi nhánh 71230276… trên erp_dev_3008 (14 015 dòng stock_balances)
When đo phần nạp tồn của listProducts
Then thời gian ≤ 25 ms (mốc hiện tại: 91 ms)
```

**AC-08** — Hàng xóm không còn bị phồng thời gian
```gherkin
Given 4 lượt nạp tồn của listProducts chạy song song trong một tiến trình
When bắn kèm một findOne theo khoá chính của organizations
Then findOne đó trả về trong ≤ 25 ms (mốc hiện tại: 83.3 ms)
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Performance | Nạp tồn đường list ≤ 25 ms trên chi nhánh 14 015 dòng | T-01-03 |
| Performance | `findOne` hàng xóm ≤ 25 ms dưới 4 lượt list song song | T-01-03 |
| Tương thích | `PosProductCardDto` không đổi field nào; không cần chạy lại `openapi:generate` | T-01-02 |
| Kiến trúc | `loadBranchStock` không bị sửa dòng nào (ADR-01 của `pos-variant-stock-columns`) | T-01-02 |
