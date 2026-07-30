---
feature: revenue-by-item-misa-parity
stories: 5
acceptance_criteria: 18
---

# Requirements — Doanh thu theo mặt hàng: parity cột với MISA

Bảng cột đích, đọc trực tiếp từ ảnh #2 (MISA). Đây là hợp đồng mà mọi AC dưới đây
tham chiếu tới:

| Cột Excel | `col` key | Nhãn | Ký hiệu (`desc`) | Kiểu |
|---|---|---|---|---|
| A | `sku` | Mã SKU | — | string |
| B | `itemName` | Tên hàng hóa | — | string |
| C | `unit` | Đơn vị tính | — | string |
| D | `locationCode` | Mã vị trí | — | string |
| E | `locationName` | Tên vị trí | — | string |
| F | `quantity` | Số lượng bán | `(1)` | number |
| G | `unitPrice` | Đơn giá TB | `(2)=(3)/(1)` | currency |
| H | `revenue.goods` | Tiền hàng | `(3)` | currency |
| I | `revenue.discount` | Khuyến mại | `(4)` | currency |
| J | `revenue.promoPoints` | Điểm KM | `(9)` | currency |
| K | `revenue.promoRate` | Tỷ lệ KM (%) | `(5)=((4)+(9))/(3)` | percent |
| L | `revenue.total` | Doanh thu | `(6)=(3)-(4)-(9)` | currency |
| M | `itemCategory` | Nhóm hàng hóa | — | string |
| N | `brand` | Thương hiệu | — | string |

---

## US-01 — Catalog cột khớp MISA

Là kế toán đối chiếu, tôi muốn báo cáo "Doanh thu theo mặt hàng" trả về đúng 14 cột
theo đúng thứ tự MISA, để đặt 2 file cạnh nhau và so theo ô thay vì dò theo tên cột.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Thứ tự và số lượng cột
```gherkin
Given tôi gọi GET /reports/invoices/columns?reportType=revenue-by-item
When response trả về
Then catalog có đúng 14 cột
And thứ tự col là: sku, itemName, unit, locationCode, locationName, quantity, unitPrice, revenue.goods, revenue.discount, revenue.promoPoints, revenue.promoRate, revenue.total, itemCategory, brand
And không có cột nào mang key supplier hay supplierName
```

**AC-02** — Nhãn riêng của báo cáo này
```gherkin
Given catalog của revenue-by-item
When tôi đọc nhãn của quantity, unitPrice và revenue.total
Then nhãn lần lượt là "Số lượng bán", "Đơn giá TB" và "Doanh thu"
And nhãn của locationCode là "Mã vị trí", của locationName là "Tên vị trí"
```

**AC-03** — Không rò nhãn sang báo cáo khác
```gherkin
Given catalog của daily-sales-summary, invoice-order-listing và invoice-item-revenue-detail
When tôi đọc nhãn của quantity, unitPrice và revenue.total ở từng báo cáo
Then nhãn vẫn là "Số lượng", "Đơn giá" và "Tổng" như trước feature này
```

**AC-04** — Ký hiệu công thức trên catalog
```gherkin
Given catalog của revenue-by-item
When tôi đọc desc của từng cột
Then quantity có desc "(1)", unitPrice "(2)=(3)/(1)", revenue.goods "(3)", revenue.discount "(4)", revenue.promoPoints "(9)", revenue.promoRate "(5)=((4)+(9))/(3)", revenue.total "(6)=(3)-(4)-(9)"
And 7 cột dimension còn lại có desc null
```

**AC-05** — Cột vị trí có ở mọi grain (A-08)
```gherkin
Given tôi gọi catalog với statBy=parent, rồi statBy=group, rồi store scope=all
When response trả về ở cả ba lần
Then locationCode và locationName vẫn nằm trong catalog ở vị trí thứ 4 và 5
```

**AC-06** — Giá trị vị trí rỗng khi không resolve được
```gherkin
Given tôi chạy search với statBy=parent trên kỳ có dữ liệu
When tôi đọc các dòng trả về
Then mọi ô locationCode và locationName đều null
And không có lỗi nào được ném
```

---

## US-02 — Ký hiệu công thức xuống tới file Excel và trang in

Là quản lý bán hàng, tôi muốn đọc được `(6)=(3)-(4)-(9)` ngay dưới tiêu đề cột
"Doanh thu" trong file tải về, để biết con số đó đã trừ những gì mà không phải hỏi ai.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-07** — Payload mang ký hiệu
```gherkin
Given tôi POST /reports/invoices/print-payload với reportType=revenue-by-item và đủ 14 cột
When response trả về
Then mỗi phần tử columns có desc đúng như AC-04
And phần tử không có ký hiệu thì desc là null hoặc vắng mặt
```

**AC-08** — Header Excel 2 dòng
```gherkin
Given tôi POST /reports/invoices/export với reportType=revenue-by-item
When tôi mở workbook trả về và đọc dòng header
Then ô cột G chứa "Đơn giá TB" và "(2)=(3)/(1)" cách nhau bằng một ký tự xuống dòng
And ô cột A chỉ chứa "Mã SKU", không có dòng thứ hai và không có ký tự xuống dòng thừa
And dòng header có wrapText bật và chiều cao đủ cho 2 dòng
```

**AC-09** — Nhãn người dùng tự đặt không xóa ký hiệu
```gherkin
Given tôi export với columnLabels đặt revenue.total thành "DT thuần"
When tôi đọc ô header của cột đó
Then ô chứa "DT thuần" và "(6)=(3)-(4)-(9)"
```

**AC-10** — Trang in cũng có ký hiệu
```gherkin
Given payload có cột mang desc
When renderReportTableHtml dựng HTML
Then mỗi th của cột đó chứa nhãn và ký hiệu trên 2 dòng
And th của cột không có desc chỉ chứa nhãn
```

**AC-11** — Chứng từ không bị ảnh hưởng
```gherkin
Given VoucherXlsxWriter ghi một phiếu nhập kho như trước
When tôi đọc dòng header của workbook
Then mỗi ô header chỉ có một dòng, không có ký tự xuống dòng nào mới
```

---

## US-03 — Dòng tham số đầy đủ theo MISA

Là kế toán, tôi muốn file xuất ra tự nói rõ nó được lọc theo cửa hàng nào, nhóm hàng
nào, thống kê theo cái gì — kể cả khi tôi không đặt filter — để file rời khỏi hệ thống
vẫn tự giải thích được.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-12** — Dòng tham số khi không đặt filter nào
```gherkin
Given tôi export revenue-by-item chỉ với khoảng ngày, cho một chi nhánh tên "Chi nhánh 211 TP. Đà Nẵng"
When tôi đọc các dòng phía trên bảng
Then có dòng "Từ ngày: ... Đến ngày: ..."
And có dòng chứa "Xem theo cửa hàng: Chi nhánh 211 TP. Đà Nẵng; Nhóm hàng hóa: Tất cả nhóm; Thống kê theo: Hàng hóa; Thống kê theo chi nhánh: Không; Loại hàng hóa: Hàng hóa; Thương hiệu: Tất cả"
And dòng đó không chứa chuỗi ": False"
```

**AC-13** — Tên thật thay cho marker "đã lọc" (A-11)
```gherkin
Given tôi export với categoryId của nhóm "Giày nam"
When tôi đọc dòng tham số
Then dòng chứa "Nhóm hàng hóa: Giày nam"
And không chứa "Nhóm hàng hóa: đã lọc"
```

**AC-14** — Id không resolve được thì lùi về marker
```gherkin
Given tôi export với categoryId trỏ tới nhóm đã bị xóa
When tôi đọc dòng tham số
Then dòng chứa "Nhóm hàng hóa: đã lọc"
And export vẫn thành công
```

**AC-15** — Phạm vi nhiều cửa hàng
```gherkin
Given tôi export với store scope=all
When tôi đọc dòng tham số
Then dòng chứa "Xem theo cửa hàng: Toàn hệ thống"
Given tôi export với store scope=group và 3 storeIds
When tôi đọc dòng tham số
Then dòng chứa "Xem theo cửa hàng: 3 cửa hàng được chọn"
```

**AC-16** — Các báo cáo hóa đơn khác giữ luật cũ
```gherkin
Given tôi export daily-sales-summary chỉ với khoảng ngày
When tôi đọc các dòng phía trên bảng
Then không có dòng tham số nào được thêm
And chỉ có dòng "Từ ngày: ... Đến ngày: ..." như trước feature này
```

---

## US-04 — Xem được grain "Mẫu mã", nhãn grain đúng nghĩa

Là kế toán, tôi muốn chọn "Thống kê theo → Mẫu mã" mà báo cáo chạy được và dòng tham
số gọi đúng tên grain, vì đó chính là grain MISA đang xuất và là grain tôi cần để đối
chiếu.

**Priority:** must
**Depends on:** —

> **Sửa 2026-07-30 (reopen G2):** khảo sát ban đầu ngờ có bug `statBy: "productTemplate"`
> → 400. Kiểm lại: `revenue-by-item` dùng `REPORT_FILTERS_LINE.STATISTIC_BY` →
> `STAT_BY_OPTIONS`, giá trị đã là `item|parent|group` — khớp `ReportGroupBy` sẵn, không
> 400. Chuỗi `productTemplate` thuộc một filter line khác
> (`STATISTIC_GROUP_BY_ITEM_OR_TEMPLATE`) của báo cáo công nợ nhà cung cấp, không liên
> quan. AC-17 dưới đây giữ nguyên vì Gherkin vẫn mô tả đúng hành vi mong muốn — chỉ khác
> là hành vi đó **đã đúng sẵn**, không cần sửa code; T-05-02 khóa lại bằng đối chiếu tay
> thay vì có một ticket sửa lỗi. Xem A-20 trong `01-assumptions.md`.

### Acceptance criteria

**AC-17** — Chọn "Mẫu mã" hoạt động đúng (đã đúng sẵn, khóa lại bằng đối chiếu tay)
```gherkin
Given tôi mở báo cáo "Doanh thu theo mặt hàng" trên backoffice
When tôi chọn "Thống kê theo" = "Mẫu mã" và bấm xem
Then request gửi statBy="parent"
And API trả 200
And các dòng được gộp theo sản phẩm cha, cột Mã SKU hiển thị mã mẫu mã (ví dụ "ABA2777") thay vì mã biến thể ("ABA2777-D-38")
```

**AC-18** — Nhãn grain trên dòng tham số đúng nghĩa
```gherkin
Given tôi export ở statBy=parent
When tôi đọc dòng tham số
Then dòng chứa "Thống kê theo: Mẫu mã"
Given tôi export ở statBy=item
When tôi đọc dòng tham số
Then dòng chứa "Thống kê theo: Hàng hóa"
```

---

## US-05 — Đối chiếu thật với file MISA

Là chủ feature, tôi muốn một lần đối chiếu file-với-file trên dữ liệu thật, vì
14 test đơn vị xanh vẫn không chứng minh được file mở ra giống ảnh #2.

**Priority:** must
**Depends on:** US-01, US-02, US-03, US-04

### Acceptance criteria

Phủ bởi ticket đối chiếu T-04-01; AC nghiệm thu là AC-01..AC-18 chạy trên file thật
thay vì trên fixture, cộng ghi chú kết quả so số tổng với ảnh #2.

---

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Tương thích | Thêm `desc?` vào `DocumentColumn` không đổi hành vi 7 loại chứng từ đang in | T-02-01 |
| Không hồi quy | Bộ test hiện có của `@erp/api` xanh trước và sau; không sửa test nào để nó xanh | T-04-02 |
| Không hồi quy | 3 báo cáo hóa đơn còn lại giữ nguyên nhãn và dòng tiêu đề | T-01-03, T-03-03 |
| Ngôn ngữ | Không có tiếng Việt nào mới trong source BE; nhãn nằm ở `packages/shared-interfaces` | T-01-01 |
| Hiệu năng | Resolve tên nhóm hàng + tên cửa hàng cho dòng tham số tốn tối đa 2 truy vấn cho mỗi lần export, không phụ thuộc số dòng | T-03-01 |
