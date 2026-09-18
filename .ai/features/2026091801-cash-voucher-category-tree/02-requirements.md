---
feature: cash-voucher-category-tree
stories: 4
acceptance_criteria: 10
---

# Requirements — cash-voucher-category-tree

## US-01 — Quản lý danh mục thu chi từ menu, dạng cây

Là quản lý / kế toán trưởng, tôi muốn mở Danh mục thu chi từ menu Danh mục và thấy các mục dưới dạng cây cha → con,
để tổ chức mục thu / mục chi theo nhóm giống như Nhóm hàng hoá.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Lối vào trên menu, gác quyền
```gherkin
Given tài khoản có quyền accounting.cash_voucher_category.read
When mở menu Danh mục › THU, CHI
Then có mục "Danh mục thu chi" dẫn tới /admin/cash-voucher-categories, breadcrumb "Danh mục › Danh mục thu chi"
And tài khoản không có quyền đó không thấy mục menu và bị routeAccess chặn khi vào thẳng URL
```

**AC-02** — Bảng dạng cây
```gherkin
Given org có nhóm "Chi phí vận hành" (Chi) chứa "Tiền điện" và "Tiền nước sinh hoạt", và các mục gốc khác
When mở /admin/cash-voucher-categories
Then bảng hiện mọi mục theo thứ tự cây: mục con thụt lề dưới mục cha, ô Mã có chevron ở mục cha, tên mục cha in đậm
And không có phân trang; thanh công cụ có "Mở rộng" / "Thu gọn"; bấm chevron ẩn/hiện mục con
And lọc cột Loại = Chi chỉ còn cây mục chi; lọc Đang hoạt động = Không chỉ còn mục đã tắt
And gõ "điện" vào lọc cột Tên thì cây chỉ còn "Chi phí vận hành" › "Tiền điện", mở sẵn
```

## US-02 — Tạo / sửa mục với mục cha

Là quản lý, tôi muốn chọn Mục cha khi tạo hoặc sửa một mục, và hệ thống chặn những cấu hình sai (khác loại, tự làm
cha, tạo vòng), để cây luôn nhất quán.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-03** — Picker "Mục cha" theo loại, loại trừ chính mình và con cháu
```gherkin
Given đang tạo mục mới, đã chọn Loại = Chi
When mở picker "Mục cha"
Then picker chỉ liệt kê mục loại Chi (dạng cây, thụt lề)
And khi sửa mục "Chi phí vận hành", picker không liệt kê chính nó và các mục con của nó
```

**AC-04** — Mặc định của form
```gherkin
Given mở dialog tạo mục mới
When chưa sửa gì
Then "Đang hoạt động" đang bật
And cột / ô Loại hiển thị "Thu" và "Chi", không phải IN / OUT
```

**AC-05** — BE từ chối cấu hình cha/con sai
```gherkin
Given org A có mục X (Chi) và Y (Chi, cha = X); org B có mục Z
When gửi PATCH/POST /admin/entities/cash-voucher-categories/records với một trong các trường hợp:
  | parentGroupId = Z (khác org) hoặc = mục đã xoá mềm |
  | parentGroupId = chính id của mục đang sửa |
  | sửa X với parentGroupId = Y (tạo vòng X → Y → X), hoặc vòng sâu hơn |
  | tạo mục loại Thu với parentGroupId = X (khác loại cha) |
  | sửa X sang Loại = Thu khi X đang có con Y |
Then API trả 400 với thông báo tiếng Việt, không ghi gì
And parentGroupId = "" hoặc null được chuẩn hoá thành null (đưa mục con lên gốc) và lưu thành công
```

**AC-06** — Xoá mục
```gherkin
Given X có mục con Y chưa xoá mềm
When DELETE X
Then API trả 400 "Không thể xóa mục đang có mục con"; X không đổi
And DELETE Y (mục lá) vẫn xoá mềm như trước; sau đó DELETE X thành công
```

## US-03 — Endpoint đọc cây

Là frontend, tôi cần một endpoint trả cả cây trong một lần gọi (không trần 100 dòng, không phân trang), để render
bảng cây và dropdown mà không tự ghép từ danh sách phẳng.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-07** — POST /v2/cash-voucher-categories/tree
```gherkin
Given org A có gốc G1 (Chi, displayOrder 2) chứa C1 (displayOrder 5) và C2 (displayOrder 1), gốc G2 (Thu), mục M (Chi, isActive false); org B có mục khác
When actor org A gọi POST /v2/cash-voucher-categories/tree với body {}
Then trả { data: [...] } gồm đúng các mục của org A, lồng theo children, anh em sắp theo displayOrder rồi name
And node mang id, code, name, description, direction, isActive, displayOrder, parentGroupId, children
And body { direction: "OUT" } chỉ trả cây mục chi; { isActive: true } bỏ M
And body { search: "c2" } trả G1 › C2 (giữ nhánh cha của mục khớp, bỏ nhánh không khớp)
And mục có parentGroupId trỏ tới mục không nằm trong kết quả được coi là gốc
And actor không có accounting.cash_voucher_category.read nhận 403
```

## US-04 — Dropdown trên phiếu theo cây

Là kế toán / thu ngân lập phiếu, tôi muốn dropdown Mục thu / Mục chi hiện mục con dưới mục cha, để chọn đúng mục
trong nhóm.

**Priority:** must
**Depends on:** US-03

### Acceptance criteria

**AC-08** — Dropdown 4 dialog
```gherkin
Given org có "Chi phí vận hành" (Chi) chứa "Tiền điện"
When mở Phiếu chi tiền mặt, thêm dòng, mở dropdown Mục chi
Then option "Chi phí vận hành" rồi ngay dưới là option "Tiền điện" thụt lề (NBSP), chọn được cả hai
And lưu phiếu với "Tiền điện", mở lại phiếu → ô Mục chi hiện "Tiền điện" (không thụt lề)
And Phiếu chi tiền gửi cùng hành vi; Phiếu thu tiền mặt / tiền gửi hiện cây mục thu
And lưới Thu chi tiền mặt, Thu chi tiền gửi, Sổ quỹ tiền mặt vẫn hiện tên mục của phiếu cũ (kể cả mục đã tắt)
```

## Non-functional

**AC-09** — Migration và kiểm thử
```gherkin
Given DB có dữ liệu mục thu chi hiện hữu
When chạy pnpm migration:run rồi pnpm migration:generate
Then cột parent_group_id, FK ON DELETE SET NULL và index tồn tại; mọi mục hiện có parent_group_id = null (mục gốc)
And migration:generate không sinh diff; seed org mới (CashVoucherCategorySeederService) không đổi
And pnpm --filter @erp/api test xanh; test:e2e áp migration ở global-setup và xanh
```

**AC-10** — Hồi quy Nhóm hàng hoá
```gherkin
Given /admin/inventory-item-categories trước khi tổng quát hoá chế độ cây
When mở lại trang sau khi T-01-03 hoàn tất
Then cây, thu gọn / mở rộng, lọc theo tên, bấm tên mở dialog sửa, "Lưu và thêm mới", nhập / xuất Excel hoạt động như trước
And request vẫn là POST /v2/inventory/item-categories/tree với body { search } và queryKey ["item-category-tree", body]
```
