---
feature: 2026092501-role-admin-authority
stories: 2
acceptance_criteria: 5
---

# Requirements — Quản trị hệ thống được sửa mọi vai trò dưới nó

## US-01 — Admin sửa được vai trò dưới quyền mình

Là Quản trị hệ thống, tôi muốn sửa được mọi vai trò mà tôi có đủ quyền để gán,
để không bị một cờ dữ liệu chặn lại trên chính hệ thống mình quản trị.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Vai trò thường mở ra ở chế độ sửa
```gherkin
Given tôi đăng nhập bằng tài khoản Quản trị hệ thống
When tôi chọn vai trò "Quản lý tổng" và bấm nút sửa
Then form mở ra ở chế độ ghi, tiêu đề "Sửa quản lý vai trò"
```

**AC-02** — Vai trò hệ thống cũng mở ra ở chế độ sửa
```gherkin
Given tôi đăng nhập bằng tài khoản Quản trị hệ thống
When tôi chọn vai trò "Quản trị hệ thống" và bấm nút sửa
Then form mở ra ở chế độ ghi, và nhãn cảnh báo chỉ còn nói về đổi tên và xóa
```

**AC-03** — Đổi tên và xóa vai trò hệ thống vẫn bị từ chối
```gherkin
Given một vai trò có is_system = true
When bất kỳ ai gọi PATCH đổi tên hoặc DELETE vai trò đó
Then API trả 400 "System roles cannot be renamed" / "cannot be deleted"
```

## US-02 — Quyền sửa không vượt quá quyền của người sửa

Là chủ hệ thống, tôi muốn người sửa vai trò không thể tự nâng quyền hoặc tự khóa
mình ra ngoài, để việc mở quyền sửa không mở luôn một đường leo thang.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-04** — Tài khoản không đủ quyền chỉ xem được
```gherkin
Given tôi đăng nhập bằng tài khoản Quản lý chi nhánh
When tôi chọn vai trò "Quản lý tổng" và mở form
Then form mở ở chế độ chỉ đọc, tiêu đề "Xem vai trò", không có nút Lưu
```

**AC-05** — Không tự hạ quyền mình và không cấp quyền mình không có
```gherkin
Given tôi đang mang vai trò X
When tôi lưu vai trò X với tập quyền thiếu một khóa tôi chỉ có nhờ X
Then API trả 403 và không ghi gì
```
