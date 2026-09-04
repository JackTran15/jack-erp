---
feature: pos-barcode-focus
stories: 2
acceptance_criteria: 4
---

# Requirements — POS barcode scan input keeps keyboard focus

## US-01 — Ô quét mã vạch tự động có focus khi vào màn hình bán hàng

Là thu ngân POS, tôi muốn ô "Quét mã vạch (F3)" tự động có focus mỗi khi tôi vào
màn hình bán hàng, để tôi quét ngay mà không cần bấm chuột hay F3 trước.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Focus khi mount lần đầu (sau đăng nhập / chọn chi nhánh)
```gherkin
Given tôi vừa đăng nhập POS và chọn chi nhánh thành công
When màn hình bán hàng (CheckoutPage) được mount
Then ô "Quét mã vạch (F3)" có keyboard focus mà không cần thao tác nào thêm
```

**AC-02** — Focus khi mount lại (quay lại từ trang khác)
```gherkin
Given tôi đang ở màn hình Danh sách hoá đơn hoặc Đổi trả
When tôi điều hướng quay lại màn hình bán hàng
Then ô "Quét mã vạch (F3)" có keyboard focus mà không cần thao tác nào thêm
```

## US-02 — Ô quét mã vạch tự động lấy lại focus sau khi bán hàng

Là thu ngân POS, tôi muốn ô "Quét mã vạch (F3)" tự động lấy lại focus ngay sau khi
một giao dịch được chốt xong, để tôi quét đơn tiếp theo ngay lập tức mà không bị
gián đoạn bởi hộp thoại in.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-03** — Focus ngay sau khi giao dịch ghi nhận (trước khi in)
```gherkin
Given tôi vừa bấm hoàn tất thanh toán và giao dịch được ghi nhận thành công
When giỏ hàng được reset (trước khi hộp thoại in trình duyệt xuất hiện)
Then ô "Quét mã vạch (F3)" nhận focus
```

**AC-04** — Focus lại sau khi hộp thoại in đóng
```gherkin
Given giao dịch vừa ghi nhận thành công và hộp thoại in trình duyệt (window.print)
  đã được kích hoạt
When hộp thoại in đóng lại (in xong, huỷ, hoặc timeout fallback)
Then ô "Quét mã vạch (F3)" nhận focus một lần nữa
```

## Non-functional

| Kind        | Requirement                                                        | Verified by |
| ----------- | ------------------------------------------------------------------- | ----------- |
| Consistency | Dùng đúng signal-counter pattern sẵn có (`requestProductSearchFocus`), không thêm cơ chế focus mới | T-01-01, T-01-02 |
