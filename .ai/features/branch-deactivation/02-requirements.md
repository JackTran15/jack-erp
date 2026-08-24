---
feature: branch-deactivation
stories: 5
acceptance_criteria: 24
---

# Requirements — Ngừng hoạt động cửa hàng

## US-01 — Bật/tắt "Ngừng hoạt động"

Là quản trị chuỗi, tôi muốn tích một ô để cho cửa hàng nghỉ và bỏ tích để mở lại,
để không phải xoá cửa hàng (vốn đã bị chặn vì có dữ liệu phát sinh).

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Ngừng hoạt động
```gherkin
Given tôi có quyền branch.archive và cửa hàng "Hà Nội" đang ACTIVE
When tôi mở form Sửa cửa hàng, tích ô "Ngừng hoạt động", xác nhận và bấm Lưu
Then branches.status của "Hà Nội" bằng SUSPENDED
And danh sách cửa hàng hiển thị "Hà Nội" ở trạng thái đã ngừng
```

**AC-02** — Hộp thoại xác nhận nêu đúng hậu quả
```gherkin
Given cửa hàng "Hà Nội" đang ACTIVE và còn tồn kho cùng 2 lệnh chuyển kho chưa nhận
When tôi tích ô "Ngừng hoạt động" và bấm Lưu
Then hộp thoại xác nhận nêu tên cửa hàng và cảnh báo các thiết bị bán hàng sẽ không làm việc được nữa
And hộp thoại liệt kê số liệu còn tồn đọng lấy từ GET /branches/:id/deactivation-impact
And hộp thoại KHÔNG chặn thao tác — bấm đồng ý là lưu được
```

**AC-03** — Mở lại hoạt động
```gherkin
Given cửa hàng "Hà Nội" đang SUSPENDED
When tôi bỏ tích ô "Ngừng hoạt động" và bấm Lưu
Then branches.status của "Hà Nội" bằng ACTIVE
And mọi bề mặt ở US-02 và US-03 nhìn thấy lại "Hà Nội"
```

**AC-04** — Không đủ quyền
```gherkin
Given tôi đăng nhập bằng tài khoản Branch Manager (không có branch.archive)
When tôi gọi POST /branches/:id/suspend hoặc POST /branches/:id/activate
Then API trả 403
```

**AC-05** — Không ngừng được cửa hàng chính
```gherkin
Given cửa hàng "Trụ sở" có isMainBranch = true
When tôi cố ngừng hoạt động cửa hàng đó
Then API trả 400 với thông báo tiếng Việt nêu rõ đây là cửa hàng chính
```

**AC-06** — Màn Cửa hàng vẫn thấy cửa hàng đã ngừng
```gherkin
Given cửa hàng "Hà Nội" đang SUSPENDED
When tôi mở màn Cửa hàng trên backoffice
Then "Hà Nội" vẫn nằm trong danh sách với ô "Ngừng hoạt động" đang tích
```

## US-02 — Cửa hàng đã ngừng biến mất khỏi mọi ô chọn

Là người dùng ERP, tôi không muốn thấy cửa hàng đã đóng trong bất kỳ danh sách chọn nào,
để không chọn nhầm.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-07** — Danh sách cửa hàng toàn tổ chức
```gherkin
Given cửa hàng "Hà Nội" đang SUSPENDED
When gọi GET /branches
Then response không chứa "Hà Nội"
And gọi GET /branches?includeInactive=true thì có chứa "Hà Nội"
```

**AC-08** — Danh sách cửa hàng của tôi
```gherkin
Given tôi được gán cả "Hà Nội" và "Hồ Chí Minh", và "Hà Nội" đang SUSPENDED
When gọi GET /branches/me
Then response chỉ chứa "Hồ Chí Minh"
And access token cấp mới có branchIds chỉ gồm "Hồ Chí Minh"
```

**AC-09** — Không chuyển sang cửa hàng đã ngừng
```gherkin
Given cửa hàng "Hà Nội" đang SUSPENDED và tôi vẫn còn assignment tới nó
When gọi POST /auth/switch-branch với branchId của "Hà Nội"
Then API trả 403
```

**AC-10** — Hiệu lực tức thì, không chờ token hết hạn
```gherkin
Given tôi đang cầm access token cấp trước khi "Hà Nội" bị ngừng, với branchId = "Hà Nội"
When tôi gọi bất kỳ endpoint nghiệp vụ nào bằng token đó
Then API từ chối ngay, không đợi hết 15 phút TTL
```

**AC-11** — POS bị đá về màn chọn chi nhánh
```gherkin
Given máy POS đang mở ở chi nhánh "Hà Nội" và "Hà Nội" vừa bị ngừng
When POS làm mới phiên
Then POS chuyển về màn chọn chi nhánh và danh sách không còn "Hà Nội"
```

**AC-12** — Backoffice hoà giải chi nhánh đang chọn
```gherkin
Given backoffice đang chọn "Hà Nội" (lưu ở localStorage) và "Hà Nội" vừa bị ngừng
When tôi tải lại trang
Then ô chọn chi nhánh không còn "Hà Nội" và không kẹt ở trạng thái lỗi
```

## US-03 — Cửa hàng đã ngừng biến mất khỏi báo cáo

Là người xem báo cáo, tôi không muốn thấy cửa hàng đã đóng trong bộ lọc hay trong số liệu tổng hợp.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-13** — Bộ lọc cửa hàng của cả ba nguồn filter-options
```gherkin
Given cửa hàng "Hà Nội" đang SUSPENDED
When gọi GET /reports/invoices/filter-options?type=store,
  GET /reports/profit/filter-options?type=store,
  và GET /reports/inventory/filter-options?type=store
Then không nguồn nào trả về "Hà Nội"
```

**AC-14** — Báo cáo tồn kho theo chi nhánh không còn cột
```gherkin
Given cửa hàng "Hà Nội" đang SUSPENDED và từng có tồn kho
When gọi GET /reports/inventory/stock-by-branch
Then mảng branches trong response không chứa "Hà Nội"
And không dòng nào còn cột số liệu của "Hà Nội"
```

**AC-15** — Kỳ quá khứ cũng không gộp
```gherkin
Given "Hà Nội" có doanh thu và tồn kho ở tháng trước, và vừa bị ngừng hôm nay
When tôi mở báo cáo tổng hợp toàn chuỗi cho tháng trước
Then số liệu của "Hà Nội" không được cộng vào tổng
```

## US-04 — Không ghi được sang cửa hàng đã ngừng

Là người lập chứng từ liên chi nhánh, tôi cần hệ thống từ chối chi nhánh đích đã đóng,
để hàng và tiền không bị kẹt.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-16** — Lệnh điều chuyển
```gherkin
Given cửa hàng "Hà Nội" đang SUSPENDED
When gọi POST /transfer-orders hoặc PATCH /transfer-orders/:id với destinationBranchId = "Hà Nội"
Then API trả 400 với thông báo tiếng Việt
```

**AC-17** — Xuất nhanh kèm xác nhận
```gherkin
Given cửa hàng "Hà Nội" đang SUSPENDED
When gọi createAndConfirmExport với targetBranchId = "Hà Nội"
Then API trả 400
```

**AC-18** — Chuyển quỹ và chuyển tiền gửi
```gherkin
Given cửa hàng "Hà Nội" đang SUSPENDED
When tạo phiếu chuyển quỹ tiền mặt hoặc chuyển tiền gửi với toBranchId = "Hà Nội"
Then API trả 400
```

**AC-19** — Chi nhánh đích không tồn tại hoặc khác tổ chức
```gherkin
Given một UUID không thuộc tổ chức của tôi
When tôi dùng nó làm chi nhánh đích ở bất kỳ chứng từ nào ở AC-16..18
Then API trả 400 thay vì tạo chứng từ như hiện nay
```

## US-05 — Không phá thứ đang chạy

Là người vận hành, tôi cần chắc rằng ngừng một cửa hàng không làm hỏng đăng nhập của ai
và không làm mất tên cửa hàng trên chứng từ cũ.

**Priority:** must
**Depends on:** US-02

### Acceptance criteria

**AC-20** — Đăng nhập khi không còn chi nhánh nào
```gherkin
Given tôi chỉ được gán duy nhất "Hà Nội" và "Hà Nội" đang SUSPENDED
When tôi đăng nhập
Then đăng nhập thành công với branchIds rỗng, không có lỗi 5xx
```

**AC-21** — Trạng thái rỗng trên backoffice
```gherkin
Given tôi đăng nhập với branchIds rỗng
When tôi mở backoffice
Then tôi thấy thông báo chưa được gán cửa hàng nào kèm hướng dẫn liên hệ quản trị
And không thấy màn hình trắng hay vòng xoay vô tận
```

**AC-22** — Trạng thái rỗng trên POS
```gherkin
Given tôi đăng nhập POS với branchIds rỗng
When PosRequireBranch chạy
Then POS hiển thị thông báo chưa được gán cửa hàng, không lặp vô hạn về màn chọn chi nhánh
```

**AC-23** — Chứng từ cũ vẫn in đúng tên
```gherkin
Given có một lệnh điều chuyển cũ với chi nhánh đích là "Hà Nội", nay đã SUSPENDED
When tôi mở danh sách lệnh điều chuyển hoặc in phiếu
Then tên "Hà Nội" vẫn hiển thị đúng, không rỗng và không hiện UUID
```

**AC-24** — Tra cứu theo id vẫn chạy
```gherkin
Given cửa hàng "Hà Nội" đang SUSPENDED
When gọi GET /branches/:id với id của "Hà Nội"
Then API trả về bản ghi kèm status SUSPENDED, không trả 404
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Hiệu năng | Kiểm tra "chi nhánh đã ngừng" trong `AuthGuard` không thêm round-trip mới ngoài lần Redis vốn đã có cho `isSessionActive` | T-02-02 |
| Bảo mật | Hai endpoint lifecycle bắt buộc `branch.archive`; `BranchController` hiện chưa gắn `PermissionGuard` | T-01-02 |
| Ngôn ngữ | Mọi thông báo lỗi và chuỗi UI mới đều tiếng Việt | T-01-04, T-04-01 |
| Bằng chứng | Ảnh chụp trước/sau trên `local-backoffice`, `local-backoffice-bm`, `local-pos` | UOW-05 demo |
