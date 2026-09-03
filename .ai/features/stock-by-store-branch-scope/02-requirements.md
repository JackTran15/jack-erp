# Requirements — stock-by-store-branch-scope

## US-01 — Báo cáo tồn kho theo cửa hàng hiện đủ mọi chi nhánh cho mọi vai trò mở được nó

Là **Quản lý chi nhánh** hoặc **Nhân viên kho**, tôi mở *Số lượng tồn kho theo cửa hàng* và thấy
tồn kho của **tất cả** cửa hàng trong chuỗi, để biết hàng đang nằm ở đâu mà điều chuyển.

Đây là quyết định của chủ dự án ngày 03/09/2026 (ADR-04) và nó **nới** phạm vi so với hành vi
đang chạy: đường v2 hiện kẹp theo `actor.branchIds`.

**AC-01** — Cột chi nhánh phủ toàn tổ chức, không phụ thuộc phân công
```gherkin
Given tài khoản có "inventory.reports.read" nhưng KHÔNG có "reporting.dashboard.consolidated.read"
  And tổ chức có N chi nhánh, tài khoản chỉ được gán 2 trong số đó
When gọi buildColumns của báo cáo "inventory-stock-by-store-pivot"
Then có đúng N cột động, một cột cho mỗi chi nhánh của tổ chức
```

**AC-02** — Dữ liệu và tổng cũng phủ toàn tổ chức
```gherkin
Given cùng tài khoản như AC-01
When gọi buildData (và countRows của đường xuất khẩu)
Then engine StockBalancePivotService nhận branchIds = undefined (không có điều kiện chi nhánh)
  And dòng tổng bằng đúng tổng toàn tập của tổ chức
```

**AC-03** — Vẫn khoá theo tổ chức
```gherkin
Given tài khoản thuộc tổ chức A
When gọi buildColumns hoặc buildData
Then chỉ chi nhánh của tổ chức A xuất hiện
  And engine luôn nhận organizationId của tài khoản
```

**AC-04** — Lọc theo cửa hàng vẫn dùng được, và chỉ chặn id ngoài tổ chức
```gherkin
Given tài khoản như AC-01
When request khai filters.store = { scope: "group", storeIds: [<chi nhánh KHÔNG được gán>] }
Then báo cáo trả dữ liệu của chi nhánh đó
When storeIds chứa id không thuộc tổ chức
Then API trả 400 "Unknown store ids"
```

**AC-05** — Tài khoản có quyền xem toàn chuỗi không đổi
```gherkin
Given tài khoản có "reporting.dashboard.consolidated.read"
When gọi buildColumns và buildData
Then kết quả giống hệt tài khoản không có quyền đó
  And con số bằng đúng tổng toàn tập
```

## US-02 — Chỉ nới đúng một báo cáo

Là **người vận hành**, tôi muốn việc nới phạm vi không lan sang báo cáo khác, để đừng mở thêm cửa
ngoài phần đã được duyệt.

**AC-09** — 7 báo cáo kho còn lại giữ nguyên
```gherkin
Given tài khoản như AC-01
When mở "Tổng hợp nhập xuất tồn kho theo cửa hàng" và các báo cáo kho khác
Then phạm vi của chúng không đổi so với trước thay đổi này
  And resolveInventoryBranchIds / permittedBranchIds không bị sửa
```

## US-03 — Gỡ bỏ đường báo cáo kho legacy không có chốt chặn

Là **người vận hành hệ thống**, tôi muốn đường báo cáo kho cũ biến mất hẳn. Phạm vi dữ liệu của nó
đúng ý (org-wide), nhưng nó nhận `branchIds` thẳng từ query string và không đi qua bất kỳ lớp kiểm
tra nào — trùng lặp với v2 và là mã chết phải bảo trì song song.

**AC-06** — Endpoint legacy không còn tồn tại
```gherkin
Given API đang chạy
When gọi GET /reports/inventory/stock-by-branch (hoặc 7 endpoint GET /reports/inventory/* còn lại)
Then nhận 404
  And openapi.snapshot.json không còn khai các đường dẫn đó
```

**AC-07** — Trang legacy không còn route, menu v2 không đổi
```gherkin
Given backoffice đã build
When mở /reports/storage/stock-by-branch
Then rơi vào màn hình 404, không render bảng báo cáo cũ
  And Báo cáo → Kho vẫn liệt kê và chạy đủ 8 báo cáo qua ReportPage v2
```

**AC-08** — Hằng số dùng chung không bị xoá kèm
```gherkin
Given dto/inventory-report-query.dto.ts bị xoá
When build API
Then PERIOD_PRESETS và PeriodPresetLiteral vẫn dùng được cho inventory-report-filter.dto.ts
  And không có lỗi TypeScript
```
