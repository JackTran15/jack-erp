---
feature: report-permissions
stories: 5
acceptance_criteria: 19
---

# Requirements — Phân quyền báo cáo

## US-01 — Cấp quyền theo từng báo cáo

Là chủ cửa hàng, tôi muốn cấp cho một vai trò đúng những báo cáo họ cần,
để nhân viên không thấy báo cáo ngoài phận sự.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Ô chọn báo cáo chỉ liệt kê báo cáo được cấp
```gherkin
Given vai trò chỉ được cấp "Doanh thu theo mặt hàng" trong nhóm Bán hàng
When tôi mở /reports/sales và bấm "Chọn báo cáo"
Then danh sách Báo cáo chỉ có một mục "Doanh thu theo mặt hàng"
```

**AC-02** — API từ chối báo cáo không được cấp
```gherkin
Given vai trò không được cấp "Tổng hợp bán hàng theo ngày"
When tôi gọi POST /reports/invoices/search với reportType "daily-sales-summary"
Then trả về 403 nêu đúng khóa còn thiếu "reporting.sales.daily-sales-summary.read"
```

**AC-03** — reportType lạ không bị trả 403
```gherkin
Given tôi gửi một reportType không có trong catalogue
When request đi qua ReportPermissionGuard
Then guard cho đi tiếp để controller trả 400/404, không phải 403
```

**AC-04** — Menu hiện khi có bất kỳ báo cáo con nào được cấp
```gherkin
Given vai trò chỉ được cấp một báo cáo trong nhóm Kho
When tôi mở ứng dụng
Then menu "Báo cáo > Kho" vẫn hiện và mở được
```

**AC-05** — Không được cấp báo cáo nào thì báo rõ
```gherkin
Given vai trò không được cấp báo cáo nào trong nhóm
When tôi mở trang nhóm đó
Then thấy "Bạn chưa được cấp quyền xem báo cáo nào trong nhóm này"
```

**AC-18** — Template CRUD của báo cáo hóa đơn được gác trở lại
```gherkin
Given ba route templates POST/PATCH/DELETE của /reports/invoices trước đây không gác gì
When tôi gọi chúng mà không có quyền mở nhóm bán hàng
Then trả về 403
```

## US-02 — Cửa hàng không xem được số tiền của nhau

Là chủ hệ thống, tôi muốn doanh số, lợi nhuận và công nợ bị kẹp theo cửa hàng
được gán, để các cửa hàng không đọc được kết quả kinh doanh của nhau.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-06** — Mặc định kẹp theo cửa hàng được gán
```gherkin
Given tôi là quản lý chi nhánh được gán 4 cửa hàng, không có quyền toàn chuỗi
When tôi chạy "Lợi nhuận theo mặt hàng" với Cửa hàng = Tất cả
Then chỉ ra số của 4 cửa hàng đó, nhỏ hơn số của quản trị hệ thống
```

**AC-07** — Xin cửa hàng ngoài phạm vi thì bị chặn
```gherkin
Given tôi là quản lý chi nhánh không được gán cửa hàng X
When tôi chạy báo cáo lợi nhuận với Cửa hàng = X
Then trả về 403 "Access denied for stores: X"
```

**AC-08** — Có quyền toàn chuỗi thì bỏ điều kiện chi nhánh
```gherkin
Given tôi giữ reporting.profit.consolidated.read
When tôi chạy báo cáo lợi nhuận với Cửa hàng = Tất cả
Then truy vấn không kèm điều kiện chi nhánh nào và ra số toàn tổ chức
```

**AC-09** — Bốn báo cáo công nợ cũng bị kẹp
```gherkin
Given tôi là quản lý chi nhánh không có quyền công nợ toàn chuỗi
When tôi chạy "Công nợ nhà cung cấp" cho một cửa hàng ngoài phạm vi
Then trả về 403 thay vì số liệu như trước
```

**AC-16** — Vai trò chi nhánh không giữ khóa toàn chuỗi nào
```gherkin
Given seed vai trò của tổ chức
When tôi liệt kê quyền của Quản lý chi nhánh, Nhân viên bán hàng, thu ngân, kho
Then không vai trò nào giữ *.consolidated.read
```

## US-03 — Cửa hàng tra được tồn kho toàn hệ thống

Là nhân viên cửa hàng, tôi muốn tra tồn của mọi cửa hàng trên hệ thống,
để biết nơi nào còn hàng mà không phải gọi điện hỏi.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-10** — Đọc được tồn của cửa hàng chưa được gán
```gherkin
Given tôi là quản lý chi nhánh không được gán cửa hàng X
When tôi chạy "Tổng hợp nhập xuất tồn kho" với Cửa hàng = X
Then trả về dữ liệu của X, không phải 403
```

**AC-11** — Ô chọn cửa hàng liệt kê mọi cửa hàng của tổ chức
```gherkin
Given tôi mở bộ lọc của báo cáo kho
When danh sách Cửa hàng nạp xong
Then thấy mọi chi nhánh của tổ chức, kể cả chi nhánh chưa được gán cho tôi
```

**AC-17** — Cửa hàng của tổ chức khác vẫn bị chặn
```gherkin
Given tôi truyền storeIds chứa id thuộc tổ chức khác
When báo cáo kho resolve phạm vi
Then trả về 400 "Unknown store ids"
```

## US-04 — Tách quyền xem cột giá trị

Là chủ cửa hàng, tôi muốn quyết định riêng ai được xem giá trị nhập/xuất trên
báo cáo kho, để mở tồn kho toàn hệ thống mà không lộ giá vốn.

**Priority:** must
**Depends on:** US-03

### Acceptance criteria

**AC-12** — Không có quyền thì cột giá trị biến mất khỏi bảng
```gherkin
Given vai trò không giữ reporting.inventory.value.read
When tôi mở "Tổng hợp nhập xuất tồn kho"
Then catalogue cột không còn cột *Value nào, bảng chỉ còn Số lượng
```

**AC-13** — Chặn cả ở xuất khẩu và bản in
```gherkin
Given vai trò không giữ quyền xem giá trị
When tôi bấm Xuất khẩu hoặc In báo cáo kho
Then file và payload in đều không chứa cột giá trị
```

**AC-14** — Mẫu đã lưu có cột bị cấm thì bỏ cột, không lỗi
```gherkin
Given một mẫu báo cáo đã lưu có cột outValue
And vai trò hiện không còn quyền xem giá trị
When tôi chạy mẫu đó
Then báo cáo chạy bình thường và chỉ bỏ cột đó, không trả 400
```

## US-05 — Deploy không ai mất quyền

Là người vận hành, tôi muốn đợt deploy này không làm ai mất báo cáo đang dùng,
để việc siết quyền là một quyết định có chủ đích chứ không phải tác dụng phụ.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-15** — Migration cấp bù theo quyền nhóm đang giữ
```gherkin
Given một vai trò đang giữ inventory.reports.read trước khi deploy
When migration GranularReportPermissions chạy
Then vai trò đó nhận đủ 11 khóa báo cáo kho và khóa xem giá trị
```

**AC-19** — Vai trò giữ khóa toàn chuỗi của hóa đơn được cấp bù hai khóa mới
```gherkin
Given một vai trò đang giữ reporting.invoice.consolidated.read
When migration chạy
Then vai trò đó nhận thêm reporting.profit.consolidated.read và reporting.debts.consolidated.read
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Bảo mật | Cột giá trị bị lược ở cả ba đường: xem, xuất khẩu, in | T-04-03 |
| Bảo mật | `countRows` (đường export) không bỏ qua được kiểm tra phạm vi | T-02-03, T-03-03 |
| Tương thích | Cache quyền Redis TTL 300s — sửa vai trò có độ trễ tối đa 5 phút; ghi vào tài liệu bàn giao | T-05-01 |
| Nhất quán | Một khóa báo cáo backend chỉ ứng với đúng một permission key, dùng chung cho guard, dropdown và seed | T-01-01, T-05-03 |
| UX | Dialog vai trò không cuộn toàn bộ; chỉ left-panel và vùng nội dung cuộn riêng | T-06-01 |
