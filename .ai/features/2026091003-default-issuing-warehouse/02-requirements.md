---
feature: default-issuing-warehouse
stories: 3
acceptance_criteria: 11
---

# Requirements — Kho xuất hàng mặc định và dropdown chọn kho ở POS Kho tạm

## US-01 — Quản lý chi nhánh khai báo kho xuất hàng mặc định

Là quản lý chi nhánh, tôi muốn đánh dấu một kho là "Kho xuất hàng mặc định",
để POS biết mở sẵn đúng kho mà quầy thường lấy hàng.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Tick cờ trên một kho
```gherkin
Given tôi mở Danh mục > Kho hàng và sửa một kho lưu trữ đang hoạt động
When tôi tick "Kho xuất hàng mặc định" rồi lưu
Then kho đó được ghi nhận là kho xuất mặc định của chi nhánh
```

**AC-02** — Chỉ một kho xuất mặc định mỗi chi nhánh
```gherkin
Given kho A đang là kho xuất mặc định của chi nhánh
When tôi tick "Kho xuất hàng mặc định" cho kho B cùng chi nhánh
Then kho B trở thành kho xuất mặc định
  And kho A tự động mất cờ đó
  And không có thời điểm nào cả hai cùng mang cờ
```

**AC-03** — Hai cờ mặc định độc lập nhau
```gherkin
Given kho A đang là kho nhập hàng mặc định của chi nhánh
When tôi tick thêm "Kho xuất hàng mặc định" cho chính kho A
Then kho A mang cả hai cờ
  And không có lỗi nào được báo
```

**AC-04** — PATCH chung không đổi được cờ
```gherkin
Given kho A không phải kho xuất mặc định
When tôi gửi PATCH tới admin/entities/inventory-storages/records/<id kho A> với isDefaultIssuing = true
Then cờ của kho A không đổi
  And request không trả lỗi 500
```

**AC-05** — Không ngừng hoạt động được kho xuất mặc định
```gherkin
Given kho A là kho xuất mặc định của chi nhánh
When tôi tick "Ngừng hoạt động" cho kho A rồi lưu
Then hệ thống từ chối kèm thông báo tiếng Việt yêu cầu đặt kho khác làm kho xuất mặc định trước
```

**AC-06** — Chi nhánh cũ có sẵn kho xuất mặc định sau khi nâng cấp
```gherkin
Given cơ sở dữ liệu có các chi nhánh được tạo trước khi có tính năng này
When migration chạy
Then mỗi chi nhánh có ít nhất một kho lưu trữ thật đang hoạt động có đúng một kho mang cờ kho xuất mặc định
  And kho được chọn là kho lưu trữ thật đang hoạt động cũ nhất của chi nhánh theo (created_at, id)
  And kho backing showroom và kho đã ngừng hoạt động không bao giờ được chọn
  And chi nhánh không có kho lưu trữ thật đang hoạt động nào thì không được gán cờ
```
> Sửa khi mở lại G1 (2026-09-10): thêm điều kiện đang hoạt động — xem A-03, ADR-04.

## US-02 — Thu ngân mở POS Kho tạm thấy đúng kho xuất mặc định

Là thu ngân, tôi muốn màn Kho tạm mở ra là kho tôi vẫn xuất hàng,
để không phải chọn lại kho mỗi lần vào.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-07** — Kho xuất mặc định đứng đầu dropdown, cả hai tab
```gherkin
Given chi nhánh có nhiều kho lưu trữ đang hoạt động và kho A là kho xuất mặc định
When tôi mở POS > Kho tạm ở tab "Xuất đi", rồi chuyển sang tab "Trả lại"
Then ở cả hai tab, kho A là mục đầu tiên trong dropdown chọn kho
```

**AC-08** — Kho xuất mặc định được chọn sẵn khi vào màn hình
```gherkin
Given kho A là kho xuất mặc định của chi nhánh
When tôi mở POS > Kho tạm lần đầu trong phiên
Then ô chọn kho lưu trữ đã điền sẵn kho A
```

**AC-09** — Danh sách vẫn đủ kho
```gherkin
Given chi nhánh có ba kho lưu trữ đang hoạt động
When tôi mở dropdown chọn kho ở màn Kho tạm
Then cả ba kho đều có trong danh sách
```

## US-03 — Kho và showroom đã ngừng hoạt động không xuất hiện ở POS

Là thu ngân, tôi không muốn thấy kho đã ngừng hoạt động trong dropdown,
để không chọn nhầm rồi phải huỷ phiếu.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-10** — Showroom của kho đã ngừng hoạt động biến mất
```gherkin
Given showroom S được backing bởi kho lưu trữ đã bị đặt Ngừng hoạt động
When tôi mở POS > Kho tạm
Then showroom S không xuất hiện trong dropdown chọn showroom ở cả hai tab
```

**AC-11** — Các nơi gọi cũ không đổi hành vi
```gherkin
Given một màn hình khác đang gọi GET /inventory/showrooms mà không truyền activeOnly
When endpoint trả về
Then danh sách vẫn gồm cả showroom của kho đã ngừng hoạt động, y như trước
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Toàn vẹn dữ liệu | Bất biến "một kho xuất mặc định mỗi chi nhánh" được cưỡng chế ở tầng cơ sở dữ liệu bằng partial unique index, không chỉ ở tầng ứng dụng | T-01-01 |
| Phạm vi ảnh hưởng | Thứ tự trả về của `GET /inventory/storages` không đổi, để 18+ màn backoffice đang gọi endpoint này giữ nguyên thứ tự dropdown | T-02-01 |
| Ngôn ngữ | Mọi chuỗi hiển thị và thông báo lỗi mới đều bằng tiếng Việt | T-01-04 |
