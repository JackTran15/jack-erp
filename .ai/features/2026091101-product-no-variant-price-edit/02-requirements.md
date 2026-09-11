---
feature: product-no-variant-price-edit
stories: 1
acceptance_criteria: 9
---

# Requirements — Sửa giá hàng hoá không có biến thể

## US-01 — Sửa Giá mua / Giá bán của hàng hoá không có biến thể

Là quản trị danh mục hàng hoá trên backoffice, tôi muốn thấy và sửa được Giá mua TB / Giá bán TB
khi mở Sửa một hàng hoá không có thuộc tính, để cập nhật giá mà không phải xoá tạo lại hàng.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Hàng lẻ: hiện ô giá khi sửa
```gherkin
Given hàng lẻ "AAA-AIDLC-ORPHAN" (không thuộc product, không Màu/Size) có Giá mua 100.000 và Giá bán 190.000
When tôi mở Sửa hàng hoá đó
Then khối "Thông tin" hiện ô "Giá mua TB" = 100.000 và "Giá bán TB" = 190.000, cả hai sửa được
And ô "Tồn kho ban đầu" và "Đơn giá nhập đầu kỳ" vẫn bị khoá như trước
```

**AC-02** — Hàng lẻ: lưu giá mới
```gherkin
Given tôi đang sửa hàng lẻ "AAA-AIDLC-ORPHAN"
When tôi đổi Giá mua TB thành 110.000, Giá bán TB thành 200.000 và bấm Lưu
Then hệ thống báo "Đã cập nhật Hàng hoá." và không có toast lỗi
And mở lại Sửa hàng đó thấy Giá mua TB = 110.000, Giá bán TB = 200.000
And bản ghi `items` của hàng đó có purchase_price = 110000.00, selling_price = 200000.00
```

**AC-03** — Product một dòng không thuộc tính: lưu giá mới
```gherkin
Given một product chỉ có một item, không Màu/Size (fixture "AAA-AIDLC-SINGLE": Giá mua 300.000, Giá bán 450.000)
When tôi mở Sửa, thấy hai ô giá đã điền giá hiện tại, đổi Giá bán TB thành 480.000 và bấm Lưu
Then mở lại Sửa thấy Giá bán TB = 480.000
And item của product đó trong `items` có selling_price = 480000.00
```

**AC-04** — Để trống ô giá khi sửa
```gherkin
Given tôi đang sửa một hàng hoá không có biến thể
When tôi xoá hết nội dung ô Giá mua TB
Then ô hiển thị 0
And bấm Lưu thì lưu thành công với purchase_price = 0, không có lỗi hệ thống
```

**AC-05** — Hàng có biến thể: không đổi
```gherkin
Given một product có Màu/Size và nhiều phiên bản
When tôi mở Sửa product đó
Then khối "Thông tin" không có ô "Giá mua TB" / "Giá bán TB"
And giá vẫn sửa tại bảng "Danh sách phiên bản" như trước
```

**AC-06** — Xoá hết Màu/Size của hàng có biến thể không làm lộ ô giá chung
```gherkin
Given tôi đang sửa một product có Màu/Size
When tôi xoá hết các thẻ Màu sắc và Size
Then khối "Thông tin" vẫn không có ô "Giá mua TB" / "Giá bán TB"
```

**AC-07** — Nhập Màu/Size khi đang sửa hàng không biến thể
```gherkin
Given tôi đang sửa hàng lẻ "AAA-AIDLC-ORPHAN" và thấy hai ô giá
When tôi nhập một Màu sắc
Then bảng "Danh sách phiên bản" xuất hiện
And hai ô "Giá mua TB" / "Giá bán TB" ở khối "Thông tin" ẩn đi
```

**AC-08** — Form Thêm mới không đổi
```gherkin
Given tôi mở Thêm mới hàng hoá
When tôi chưa nhập Màu/Size
Then thấy hai ô "Giá mua TB" / "Giá bán TB" sửa được
And khi tôi nhập một Màu sắc thì hai ô đó vẫn hiện nhưng bị khoá, như trước
```

**AC-09** — Product nhiều item mà không nhận ra Màu/Size: không lộ ô giá chung
```gherkin
Given một product có từ 2 item trở lên nhưng không item nào mang thuộc tính tên Color/Size (thuộc tính đặt tên khác, hoặc không có thuộc tính)
When tôi mở Sửa product đó
Then khối "Thông tin" không có ô "Giá mua TB" / "Giá bán TB"
```

## Non-functional

| Kind | Requirement | Verified by |
| ---- | ----------- | ----------- |
| Contract | Không đổi API, DTO, entity hay migration | T-01-01 (diff chỉ chạm `InventoryItemCreateForm.tsx`) |
| Regression | Nhánh cập nhật hàng lẻ (`items.id`) chuyển `purchasePrice`/`sellingPrice` xuống repository — khoá bằng unit test, vì đây là nhánh 366 hàng lẻ đi qua và chưa có test nào khẳng định giá | T-01-02 |
