---
feature: report-column-config-per-branch
stories: 3
acceptance_criteria: 11
---

# Requirements — Lưu cấu hình cột báo cáo theo từng chi nhánh

## US-01 — Mỗi chi nhánh giữ bố cục cột riêng

Là người dùng báo cáo ở một chi nhánh, tôi muốn bố cục cột tôi lưu chỉ áp dụng cho chi
nhánh của mình, để chi nhánh khác sắp lại cột không làm hỏng bố cục của tôi.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Lưu rồi tải lại vẫn còn
```gherkin
Given tôi đang đứng ở chi nhánh "Hồ Chí Minh" và mở một báo cáo có nút "Hiển thị cột"
When tôi đổi thứ tự/ẩn hiện cột rồi bấm Lưu, sau đó tải lại trang
Then lưới hiện đúng bố cục vừa lưu
```

**AC-02** — Chi nhánh khác không thấy bố cục của tôi
```gherkin
Given chi nhánh "Hồ Chí Minh" đã lưu một bố cục cột riêng cho báo cáo X
And chi nhánh "Hà Nội" cũng đã lưu một bố cục cột riêng khác cho cùng báo cáo X
When cùng một tài khoản chuyển qua lại giữa hai chi nhánh và mở báo cáo X
Then mỗi chi nhánh hiện đúng bố cục của chính nó
```

**AC-11** — Không đọc được bản của chi nhánh khác
```gherkin
Given chi nhánh "Hà Nội" có một template với id T
When tôi đang đứng ở chi nhánh "Hồ Chí Minh" và gọi GET /reports/<miền>/templates/T
Then API trả 404
And GET cùng đường dẫn với id của một bản cấp chuỗi thì trả 200 (vì chi nhánh kế thừa được)
```

## US-02 — Kế thừa cấu hình chuỗi và sửa được nó ở chế độ chuỗi

Là quản lý chuỗi, tôi muốn đặt một bố cục mặc định dùng chung, để chi nhánh chưa tự cấu
hình vẫn mở báo cáo lên là thấy bố cục hợp lý thay vì bị reset.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-03** — Kế thừa khi chi nhánh chưa cấu hình
```gherkin
Given tổ chức có một bản cấu hình cấp chuỗi cho báo cáo X
And chi nhánh "Đà Nẵng" chưa từng lưu cấu hình nào cho báo cáo X
When tôi đứng ở "Đà Nẵng" và mở báo cáo X
Then lưới hiện bố cục của bản cấp chuỗi
```

**AC-04** — Lần lưu đầu ở chi nhánh không sửa bản chuỗi (copy-on-write)
```gherkin
Given chi nhánh "Đà Nẵng" đang kế thừa bản cấp chuỗi của báo cáo X
When tôi đổi bố cục và bấm Lưu khi đang đứng ở "Đà Nẵng"
Then hệ thống tạo một bản MỚI gắn với "Đà Nẵng"
And bản cấp chuỗi giữ nguyên nội dung cũ
And chi nhánh khác đang kế thừa vẫn thấy bố cục cũ
```

**AC-05** — Chế độ "Xem theo chuỗi" ghi vào bản chuỗi
```gherkin
Given tôi có quyền xem theo chuỗi và đang ở chế độ "Xem theo chuỗi"
When tôi đổi bố cục cột của báo cáo X và bấm Lưu
Then bản cấp chuỗi được cập nhật
And không chi nhánh nào đã có bản riêng bị thay đổi
And khi tôi chuyển về xem theo một chi nhánh chưa cấu hình, chi nhánh đó hiện bố cục chuỗi mới
```

**AC-06** — Chỉ xoá được bản trong phạm vi mình đang đứng
```gherkin
Given chi nhánh "Hồ Chí Minh" đang kế thừa bản cấp chuỗi
When tôi đứng ở "Hồ Chí Minh" và gọi DELETE lên id của bản cấp chuỗi
Then API trả 404 và bản cấp chuỗi không bị xoá
```

**AC-07** — Trùng tên tính theo phạm vi
```gherkin
Given chi nhánh "Hồ Chí Minh" đã có template tên "Mặc định" cho báo cáo X
When chi nhánh "Hà Nội" tạo template cũng tên "Mặc định" cho báo cáo X
Then tạo thành công
And tạo lần hai cùng tên trong CÙNG chi nhánh thì trả 409
```

**AC-10** — Cả bốn miền cùng ngữ nghĩa
```gherkin
Given bốn bộ route /reports/{invoices,inventory,debts,profit}/templates dùng chung bảng report_templates
When tôi lặp lại AC-01..AC-07 trên từng miền
Then cả bốn miền hành xử giống nhau về phạm vi chi nhánh, kế thừa và trùng tên
```

## US-03 — Triển khai không làm chi nhánh nào mất bố cục

Là người vận hành, tôi muốn sau khi deploy mỗi chi nhánh đang hoạt động đã có sẵn một bản
sao của cấu hình chuỗi cũ, để họ sửa độc lập được ngay mà không phải dựng lại từ đầu.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-08** — Migration nhân bản cấu hình chuỗi sang mọi chi nhánh đang hoạt động
```gherkin
Given trước khi chạy migration, tổ chức O có 2 bản cấp chuỗi và 3 chi nhánh ACTIVE
When migration chạy
Then tồn tại 6 bản mới gắn với 3 chi nhánh đó, nội dung columns/filters sao y bản chuỗi
And 2 bản cấp chuỗi vẫn còn nguyên, không hàng nào bị sửa
And chi nhánh không ACTIVE không được sinh bản nào
```

**AC-09** — Chạy lại không sinh bản trùng
```gherkin
Given migration đã chạy một lần
When revert rồi chạy lại migration (hoặc chạy lại khối nhân bản)
Then số bản ghi không tăng thêm
And không lỗi vi phạm khoá duy nhất
```

## Non-functional

| Kind | Requirement | Verified by |
| ---- | ----------- | ----------- |
| Truy vấn | Đường list template vẫn là **một** SELECT; không thêm truy vấn phụ để dựng fallback | T-01-02 |
| Lược đồ | Khoá duy nhất mới phải chống trùng cả khi `branch_id` NULL (Postgres coi hai NULL là khác nhau) | T-01-01 |
| Hợp đồng | Chạy `pnpm openapi:generate` và commit `schema.ts` + `openapi.snapshot.json` sau khi đổi DTO | T-02-04 |
| Ngôn ngữ | Mã backend viết bằng tiếng Anh; chỉ chuỗi UI mới tiếng Việt | T-03-01 |
