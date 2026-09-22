---
feature: tree-select-dropdown-clip
stories: 2
acceptance_criteria: 8
---

# Requirements — tree-select-dropdown-clip

## US-01 — Kế toán chọn được Mục cha trong dialog Danh mục thu chi

Là kế toán cấu hình Danh mục thu chi, tôi muốn danh sách Mục cha hiện đủ, cuộn được và chọn được ngay trong dialog,
để gắn mục con vào nhóm cha mà không phải đoán tên hay phóng to màn hình.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Danh sách không bị modal cắt
```gherkin
Given dialog "Sửa Mục thu / Mục chi" của THU_KHAC đang mở trên khung nhìn 1440×900
When tôi bấm vào ô Mục cha
Then danh sách hiện đủ 8 mục thu còn lại (THU_BAN_HANG … THU_NO_KH, không có THU_KHAC) trong một khung
And khung nằm trọn trong viewport, không bị cắt ở mép vùng nội dung của modal
```

**AC-02** — Cuộn trong danh sách và tải trang tiếp
```gherkin
Given dialog Sửa một mục chi đang mở và ô Mục cha đã bung danh sách mục chi
When tôi lăn chuột trong khung danh sách tới đáy
Then khung cuộn nội bộ và các trang sau được tải cho tới khi đủ mọi mục chi khác của org (org MT: 33; org My Company: 35)
And không mục nào bị bỏ hay lặp dù nhiều mục cùng `created_at` (phân trang ổn định — A-09)
And nội dung form phía sau không trôi theo
```

**AC-03** — Lật lên trên khi thiếu chỗ
```gherkin
Given khung nhìn 1440×720 và ô Mục cha nằm gần mép dưới viewport (chỗ trống bên dưới < 140px)
When tôi bấm vào ô Mục cha
Then khung danh sách mở phía trên ô nhập và nằm trọn trong viewport
```

**AC-04** — Chọn, đóng, không đóng nhầm dialog
```gherkin
Given danh sách Mục cha đang mở trong dialog
When tôi bấm một mục
Then ô nhận "MÃ · Tên" của mục đó, danh sách đóng, dialog vẫn mở
When tôi mở lại danh sách rồi bấm ra ngoài nó (vẫn trong dialog)
Then danh sách đóng, dialog vẫn mở, giá trị đã chọn giữ nguyên
```

**AC-05** — Body dialog cuộn lại được
```gherkin
Given khung nhìn 1440×720 và dialog "Sửa Mục thu / Mục chi" đang mở, danh sách Mục cha đóng
When tôi lăn chuột trong vùng nội dung của dialog
Then vùng nội dung cuộn và tôi tới được ô "Thứ tự hiển thị"
```

## US-02 — Các host khác của picker cây không hồi quy

Là người dùng các màn khác có cùng picker (Nhóm hàng hoá, bộ lọc kho, trang tạo hàng hoá), tôi muốn chúng vẫn chọn
được sau khi picker đổi cách render.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-06** — Dialog Sửa Nhóm hàng hoá
```gherkin
Given dialog Sửa một nhóm hàng hoá đang mở tại /admin/inventory-item-categories
When tôi bấm vào ô Mục cha
Then danh sách bung không bị cắt, có thụt lề theo cây, không chứa chính nhóm đang sửa
And bấm một nhóm thì ô nhận giá trị, dialog vẫn mở
```

**AC-07** — Host Radix Popover: bộ lọc Nhóm hàng hoá ở Quản lý kho
```gherkin
Given panel "Bộ lọc" tại /inventory-management đang mở
When tôi bấm vào ô Nhóm hàng hoá rồi bấm một nhóm trong danh sách
Then danh sách nổi trên panel (không bị panel cắt), nhóm được ghi vào ô
And panel "Bộ lọc" vẫn mở
```

**AC-08** — Host không có dialog: trang tạo hàng hoá
```gherkin
Given trang /admin/inventory-items/new đang mở
When tôi bấm vào ô Nhóm hàng hoá (#create-category) rồi bấm một nhóm
Then danh sách bung ngay dưới ô nhập, đúng chiều rộng ô, và ô nhận giá trị
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Phạm vi sửa | `TreeSelectInput.tsx`, một dòng ở `CrudFormDialog.tsx`, tiebreaker trong `BaseCrudService.applySorting`; không đổi `LookupField`, `AppModal`, contract API | T-01-01, T-01-02, T-01-03 |
| Phân trang ổn định | Mọi list `/admin/entities/*/records` sắp thêm theo `id` sau cột đã chọn ⇒ hai trang liên tiếp không lặp, không bỏ dòng | T-01-03 |
| Kiểu | `pnpm --filter @erp/backoffice-web exec tsc --noEmit` sạch | T-01-01, T-01-02 |
| Không rò rỉ listener | Đóng dropdown hoặc unmount thì gỡ `scroll`/`resize`/`mousedown` listener | T-01-01 (review mã) |
