---
feature: sales-store-filter-and-location-fixes
stories: 3
acceptance_criteria: 15
---

# Requirements — sales-store-filter-and-location-fixes

> Câu chuyện Kho tạm (US-03 cũ) và bảy tiêu chí của nó đã tách sang `2026091103-temp-warehouse-line-shelf`
> ngày 11/09/2026. Id của các câu chuyện và tiêu chí còn lại giữ nguyên; khoảng trống trong dãy số là cố ý.

## US-01 — Báo cáo Bán hàng theo chi nhánh header

Là quản lý chi nhánh đang đứng ở một chi nhánh, tôi muốn báo cáo Bán hàng chỉ lấy dữ liệu của chi nhánh
đó mà không phải chọn cửa hàng, để số liệu không lẫn chi nhánh khác.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Ẩn dòng "Cửa hàng" ở chế độ một chi nhánh
```gherkin
Given header đang ở "Chi nhánh MT46 Đà Nẵng", không phải Chuỗi cửa hàng
When tôi mở "Chọn báo cáo" của từng báo cáo daily_sales_summary, invoice_and_order_list, revenue_detail_by_invoice_and_product, revenue_by_product
Then không có dòng "Cửa hàng"
```

**AC-02** — Ghim dữ liệu về chi nhánh header, kể cả người có quyền tổng hợp
```gherkin
Given header ở chi nhánh X và tôi có quyền reporting.invoice.consolidated.read
When tôi tải "Doanh thu theo mặt hàng" cho một kỳ
Then request mang filters.store = { scope: "group", storeIds: [X] }
And tổng doanh thu bằng tổng khi ở Chuỗi cửa hàng chọn "Theo nhóm cửa hàng" = [X]
```

**AC-03** — Cả 4 báo cáo Bán hàng cùng ghim
```gherkin
Given chế độ một chi nhánh với chi nhánh X
When dựng payload tìm kiếm cho từng báo cáo trong 4 báo cáo Bán hàng
Then payload.store = { scope: "group", storeIds: [X] }
```

**AC-04** — Xuất khẩu và In cùng phạm vi
```gherkin
Given chế độ một chi nhánh với chi nhánh X
When tôi bấm "Xuất khẩu" hoặc "In" trên một báo cáo Bán hàng
Then body gửi đi có filters.store giống hệt payload tìm kiếm
```

**AC-05** — Chuỗi cửa hàng giữ nguyên
```gherkin
Given header ở Chuỗi cửa hàng
When tôi mở "Chọn báo cáo" của một báo cáo Bán hàng
Then có dòng "Cửa hàng" với "Tất cả" và "Theo nhóm cửa hàng"
And payload chỉ mang lựa chọn của tôi, không bị ghim về chi nhánh nào
```

**AC-06** — Lựa chọn cửa hàng ở chuỗi không rò sang chế độ một chi nhánh
```gherkin
Given ở Chuỗi cửa hàng tôi đã chọn "Theo nhóm cửa hàng" = [A, B]
When tôi chuyển header sang chi nhánh X và tải một báo cáo Bán hàng
Then payload.store = { scope: "group", storeIds: [X] }
```

**AC-07** — Cột vị trí có giá trị ở chế độ một chi nhánh
```gherkin
Given header ở chi nhánh X và mặt hàng M bán ở X có kệ ưu tiên hoặc tồn đang theo dõi ở một kho lưu trữ của X
When tôi tải "Doanh thu theo mặt hàng", thống kê theo Hàng hóa
Then dòng M có "Mã vị trí" và "Tên vị trí" không trống
```

## US-02 — Danh sách "Chọn cửa hàng" cuộn được

Là người xem báo cáo ở Chuỗi cửa hàng, tôi muốn cuộn danh sách cửa hàng bằng chuột, để chọn được cửa hàng
nằm dưới cùng.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-08** — Cuộn bằng chuột
```gherkin
Given ở Chuỗi cửa hàng, "Theo nhóm cửa hàng", và số cửa hàng vượt chiều cao danh sách
When tôi mở "Chọn cửa hàng" và lăn chuột trên danh sách
Then danh sách cuộn tới cửa hàng cuối và tôi chọn được cửa hàng đó
```

**AC-09** — Phím mũi tên vẫn đưa mục đang chọn vào khung nhìn
```gherkin
Given danh sách "Chọn cửa hàng" đang mở
When tôi nhấn ArrowDown vượt khỏi phần đang thấy
Then mục đang chọn được cuộn vào khung nhìn
```

**AC-10** — Form Chương trình khuyến mãi cũng cuộn được
```gherkin
Given form Chương trình khuyến mãi, phần cửa hàng áp dụng đang ở chế độ chọn từng cửa hàng
When tôi mở danh sách cửa hàng và lăn chuột
Then danh sách cuộn được
```

## US-04 — Xếp lại vị trí sau khi ngừng theo dõi

Là nhân viên kho, tôi muốn xếp một mặt hàng sang kệ mới sau khi đã ngừng theo dõi kệ cũ, để dữ liệu vị trí
khớp với kệ thật.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-18** — Kệ cũ đã ngừng theo dõi thì xếp được
```gherkin
Given mặt hàng M trong kho S có liên kết trỏ H70.03 và dòng tồn (M, H70.03) đang "Ngừng theo dõi"
When tôi xếp M trong S sang G11.05 và bấm "Lưu"
Then không hiện lỗi "Hàng hoá đã ở vị trí H70.03"
And "Chi tiết vị trí hàng hóa" hiện (M, G11.05) "Đang theo dõi"
And (M, H70.03) vẫn "Ngừng theo dõi"
```

**AC-19** — Kệ đích cũng đã ngừng theo dõi thì bật lại, không tạo trùng
```gherkin
Given như AC-18, và dòng tồn (M, G11.05) đã có sẵn ở trạng thái "Ngừng theo dõi"
When tôi xếp M sang G11.05 và bấm "Lưu"
Then dòng (M, G11.05) chuyển "Đang theo dõi" và không phát sinh dòng thứ hai
```

**AC-20** — Kệ cũ còn đang theo dõi thì vẫn chặn
```gherkin
Given liên kết trỏ H70.03 và dòng tồn (M, H70.03) "Đang theo dõi"
When tôi xếp M sang G11.05 và bấm "Lưu"
Then hiện "Hàng hoá đã ở vị trí H70.03. Mỗi hàng hoá chỉ được ở 1 vị trí — hãy ngừng theo dõi vị trí cũ trước khi xếp sang vị trí mới."
```

**AC-21** — Liên kết chưa có dòng tồn vẫn tính là đã xếp
```gherkin
Given liên kết trỏ H70.03 và không có dòng tồn (M, H70.03)
When tôi xếp M sang G11.05 và bấm "Lưu"
Then vẫn bị chặn như AC-20
```

**AC-22** — API storage-location bỏ kệ đã ngừng theo dõi
```gherkin
Given liên kết (M, S) trỏ kệ L đang hoạt động
When gọi GET /products/storage-location?itemId=M&storageId=S
Then trả null nếu dòng tồn (M, L) tồn tại và is_tracked = false
And trả { locationId: L, code } nếu dòng tồn đang theo dõi hoặc chưa có dòng tồn
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Hiệu năng | `resolveAssignedLocation` thêm đúng một truy vấn theo khoá duy nhất (organization, item, location) của `stock_balances` | UOW-04 |
