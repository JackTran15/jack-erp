---
feature: report-row-cap-pushdown
stories: 4
acceptance_criteria: 24
---

# Requirements — Đẩy phân trang và lọc cột của báo cáo kho v2 xuống SQL

## US-01 — Xem báo cáo kho toàn chuỗi mà không bị trần chặn

Là kế toán kho, tôi muốn mở báo cáo kho ở chế độ chuỗi cửa hàng và thấy trang đầu tiên,
để không phải thu hẹp phạm vi chỉ vì danh mục hàng hoá đã lớn.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Đúng lỗi trong ảnh chụp
```gherkin
Given tổ chức có 74515 cặp (mặt hàng × vị trí kho) phát sinh trong kỳ
And tôi mở "TỔNG HỢP NHẬP XUẤT TỒN KHO" với kỳ "Tháng này", không lọc gì
When lưới gọi POST /reports/inventory/search với page=1, limit=50
Then máy chủ trả 200 với đúng 50 dòng
And không có ngoại lệ "Report exceeds 50000 rows" nào được ném trên đường search
```

**AC-02** — Footer là tổng toàn tập, không phải tổng trang
```gherkin
Given kết quả đã lọc có 74515 dòng và lưới đang xem trang 1 với 50 dòng
When máy chủ trả kết quả
Then `totals` của mỗi cột số bằng tổng của cả 74515 dòng
And `total` bằng 74515
```

**AC-03** — Đổi trang trả tập dòng khác nhau, không chồng lấn
```gherkin
Given kết quả đã lọc có nhiều hơn 100 dòng
When tôi lấy page=1 limit=50 rồi lấy page=2 limit=50
Then hai trang không có dòng nào trùng nhau
And `totals` và `total` của hai lần gọi giống hệt nhau
```

**AC-04** — Bộ số không đổi so với đường JS hiện tại
```gherkin
Given một tổ chức có ít hơn 50000 dòng, nên đường JS hôm nay vẫn chạy được
When cùng một request chạy qua đường JS cũ và đường SQL mới
Then rows, totals và total của hai đường giống nhau từng dòng, từng cột
```

**AC-22** — Cả bảy báo cáo kho v2 đều hết trần trên đường search
```gherkin
Given tổ chức vượt 50000 dòng
When tôi lần lượt gọi search cho inventory-stock-summary, inventory-stock-summary-by-store,
  inventory-stock-quantity-detail, inventory-stock-by-store-pivot, inventory-document-detail,
  inventory-transfer-by-store, inventory-temp-warehouse-out
Then cả bảy trả 200
```

**AC-23** — Đường GET cũ giữ nguyên hành vi
```gherkin
Given màn hình báo cáo kho cũ gọi các endpoint GET của InventoryReportsController
When các engine trong services/ được mở rộng specs và join
Then mọi request GET cũ trả đúng bộ số như trước khi sửa
```

---

## US-02 — Lọc theo cột tác dụng trên toàn tập

Là quản lý chi nhánh, tôi muốn gõ vào ô lọc trên đầu cột và nhận đúng những dòng khớp
trong toàn bộ kết quả, để con số ở footer là con số tôi đang tìm.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-05** — Cột văn bản mức mặt hàng
```gherkin
Given lưới lọc cột "Tên hàng hoá" chứa "giày", đồng thời "Nhóm hàng" bằng "Giày nam"
When máy chủ chạy báo cáo
Then vị từ được ghép vào SQL, không lọc sau khi phân trang
And `total` và `totals` phản ánh tập đã lọc
And các cột sku, name, parentSku, parentName, color, size, unit, group, brand đều lọc được như vậy
```

**AC-06** — Cột vị trí kho
```gherkin
Given báo cáo "Tổng hợp nhập xuất tồn kho" gộp theo (mặt hàng × vị trí)
When tôi lọc "Mã vị trí" bắt đầu bằng "A1"
Then chỉ những cặp có vị trí khớp còn lại, ở cả trang lẫn footer
```

**AC-07** — Cột nhà cung cấp
```gherkin
Given mỗi mặt hàng có tối đa một nhà cung cấp chính (UQ_item_providers_primary)
When tôi lọc cột "Nhà cung cấp" chứa "Bitis"
Then join item_providers nằm trong SQL của cả câu dữ liệu lẫn câu count
And số dòng không nở ra so với khi không lọc cột này
```

**AC-08** — Bốn cột điều chuyển
```gherkin
Given transferOutQty / transferOutValue / incomingQty / incomingValue hôm nay được ghép bằng JS
  theo quy tắc khử trùng "chỉ lượt pending đầu tiên"
When tôi lọc "Tồn đang chuyển đi" lớn hơn 0
Then kết quả khớp đúng quy tắc khử trùng cũ, và footer khớp cột
```

**AC-09** — Cột số, cả so sánh đơn lẫn khoảng
```gherkin
Given lưới gửi {col: "endingQty", gte: 10} hoặc {col: "endingQty", from: 10, to: 20}
When máy chủ chạy báo cáo
Then vị từ số được ghép vào SQL trên đúng biểu thức mà dòng đang hiển thị
And endingQty ánh xạ sang (opening_qty + in_qty - out_qty), không phải một cột lưu sẵn
```

**AC-11** — Cột chưa đẩy được thì báo, không im lặng
```gherkin
Given một cột của báo cáo chưa có biểu thức SQL (trạng thái trung gian giữa các UoW)
When lưới gửi bộ lọc cho cột đó
Then máy chủ trả 400 nêu đích danh tên cột
And không bao giờ trả một trang đã bỏ qua bộ lọc như thể đã lọc
```

**AC-14** — Nhiều toán tử trên một cột thì từ chối, không bỏ bớt
```gherkin
Given một client tự dựng gửi {col: "endingQty", gt: 5, lt: 10}
When adapter chuyển sang từ vựng của engine
Then máy chủ trả 400 nêu rõ cột và các toán tử xung đột
And không lặng lẽ chỉ áp một vế
```

**AC-15** — Báo cáo theo cửa hàng
```gherkin
Given "Tổng hợp nhập xuất tồn theo cửa hàng" gộp theo (mặt hàng × chi nhánh)
When tôi lọc cột "Cửa hàng"
Then vị từ chạy dưới SQL trên tên chi nhánh, ở cả trang lẫn footer
```

**AC-16** — Chi tiết số lượng tồn, các cột phân rã
```gherkin
Given báo cáo bật includeBreakdown
When tôi lọc "Nhập mua" lớn hơn 0
Then vị từ áp trên in_qty_purchase dưới SQL
And inTotal / outTotal ánh xạ đúng sang in_qty / out_qty
```

**AC-17** — Sáu cột chỗ trống
```gherkin
Given inWh, inOther, outPurchaseReturn, outWh, outVoid, outOther luôn null
When lưới gửi bộ lọc cho một trong sáu cột đó
Then máy chủ trả 400 "cột không hỗ trợ lọc" thay vì trả trang rỗng khó hiểu
```

**AC-18** — Bảng pivot, cột chi nhánh động
```gherkin
Given cột branch.qty.<branchId> được sinh theo số chi nhánh của tổ chức
When tôi lọc một cột chi nhánh lớn hơn 0
Then truy vấn con tương quan trên stock_balances được ghép vào itemPageSql và itemCountSql
And danh sách mặt hàng của trang đã được lọc trước khi fan-out ô theo chi nhánh
```

**AC-19** — Bảng pivot, cột tổng
```gherkin
Given cột "Tổng" là tổng tồn toàn tổ chức của một mặt hàng
When tôi lọc "Tổng" lớn hơn 100
Then vị từ chạy dưới SQL ở bước chọn mặt hàng, không phải sau khi gấp ô
```

**AC-20** — Chi tiết chứng từ xuất nhập kho
```gherkin
Given báo cáo hợp nhất ba nguồn chứng từ bằng UNION
When tôi lọc "Ngày", "Loại chứng từ", "Kho", "Khách hàng" hoặc "Ghi chú"
Then vị từ chạy ở tầng ngoài cùng, sau UNION
And đường xuất khẩu bằng con trỏ (keyset) vẫn chạy đúng với cùng bộ lọc
```

**AC-21** — Điều chuyển theo cửa hàng
```gherkin
Given báo cáo có hai cột đơn giá bình quân không cộng được
When tôi lọc "Cửa hàng nhận" hoặc một cột số
Then vị từ chạy dưới SQL
And outAvgPrice / inAvgPrice vẫn vắng mặt trong totals, đúng như hôm nay
```

---

## US-03 — Bộ lọc trên thanh lọc tác dụng trên toàn tập

Là người xem báo cáo, tôi muốn chọn "Đơn vị tính" hay "Thương hiệu" ở thanh lọc và
nhận đúng tập đã lọc, chứ không phải trang hiện tại bị cắt bớt.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-10** — unit và brand xuống SQL cùng lượt với báo cáo
```gherkin
Given filters.unit = "Đôi" và kết quả trải trên nhiều trang
When máy chủ chạy báo cáo sau khi đã đẩy phân trang xuống SQL
Then vị từ đơn vị tính nằm trong SQL
And không còn dòng nào bị loại sau khi cắt trang
```

**AC-24** — Khoá cache vẫn tách theo tổ chức
```gherkin
Given hai tổ chức chạy cùng một payload báo cáo
When kết quả được ghi vào cache
Then khoá cache vẫn băm organizationId nên hai tổ chức không đọc trúng nhau
```

---

## US-04 — Xuất khẩu và In vẫn có trần bảo vệ

Là người vận hành hệ thống, tôi muốn đường xuất khẩu vẫn từ chối một tập quá lớn,
để một lần bấm "Xuất khẩu" không kéo cả tiến trình API xuống.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-12** — countRows thay chỗ cho assert trong buildData
```gherkin
Given một định nghĩa báo cáo đã gỡ assertUnderRowCap khỏi buildData
When POST /reports/inventory/export chạy cho tổ chức có 74515 dòng
Then ReportExportService.prepareExport gọi countRows() rồi ném 400
And 400 xảy ra trước khi sink ghi byte đầu tiên
```

**AC-13** — print-payload cũng vậy
```gherkin
Given cùng tổ chức đó
When POST /reports/inventory/print-payload chạy
Then máy chủ trả 400 chứ không vật chất hoá 74515 dòng
```

---

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Correctness | Câu dữ liệu và câu count nhận **cùng một** mảnh vị từ; không có nhánh nào lọc riêng | T-02-02 |
| Performance | Thời gian phản hồi của search không tăng theo số dòng toàn tập ngoài chi phí count | T-02-05 |
| Compatibility | `InventoryReportSearchDto` và mọi endpoint không đổi chữ ký; không cần chạy `openapi:generate` | T-01-04 |
| Safety | Mọi định danh ghép vào SQL đến từ map spec cố định; giá trị luôn là tham số vị trí | T-01-02 |
| Regression | `pnpm --filter @erp/api test` xanh trọn vẹn sau mỗi UoW | mọi UoW |
