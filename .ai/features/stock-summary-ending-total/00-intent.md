# Intent — stock-summary-ending-total

## Problem

Báo cáo **Tổng hợp nhập xuất tồn kho** (`/reports/inventory#inventory_in_out_stock_summary`)
có hàng **Tổng** ở footer. Mọi cụm cột đều ra số đúng — trừ cụm **"Tồn cuối kỳ"**, luôn in
**0** ở cả "Số lượng" lẫn "Giá trị", trong khi các dòng dữ liệu ngay phía trên có tồn cuối kỳ
khác 0.

Nguyên nhân nằm ở tầng engine chứ không ở lưới. `StockPeriodService.readPeriodTotals`
(`stock-period.service.ts`) dựng map totals từ `NUMERIC_PERIOD_COLUMNS` — danh sách này
**không có** `closingQty` / `closingValue`, vì tồn cuối kỳ là cột **dẫn xuất**
(`opening + in − out`) chứ không phải một cột SQL. `toTotalsRow` ánh xạ
`endingQty → closingQty`, không thấy khoá nên trả `null` (đúng theo hợp đồng của nó: thiếu
tổng thì trả `null`, không bịa số 0). Lưới thì gọi `formatReportNumber(null)`, mà hàm này
quy mọi giá trị không phải số về **0** — nên `null` "không có tổng" hiện ra thành "tổng bằng 0".

Doc comment của `StockPeriodResult.totals` ghi rằng FE tự suy ra hai cột này. FE chưa bao giờ
làm việc đó; `ReportPageTableView` chỉ đọc thẳng `totals[col.column]`.

## Success signal

Footer "Tồn cuối kỳ" bằng đúng `tổng tồn đầu + tổng nhập − tổng xuất` của **toàn bộ** tập
kết quả lọc, đọc được ngay trên cùng khung hình với ba cụm cột kia để tự đối chiếu.

## Out of scope

- Định dạng số / bố cục footer (đã xong ở `report-sticky-header-footer`).
- Các cột dẫn xuất của những báo cáo **không** chạy qua `StockPeriodService`.
- `formatReportNumber` quy `null` về 0 — đây là hành vi che lỗi, nhưng sửa nó động tới
  ~20 báo cáo chain-store và cần quyết định riêng "không có tổng thì in gì".

## Constraints

- Không thêm biểu thức vào câu SQL count: SUM tuyến tính nên tổng tồn cuối kỳ suy được từ
  ba tổng đã có, không cần truy vấn thêm.
- Sửa ở một chỗ: ba báo cáo (`stock-summary`, `stock-summary-by-store`,
  `stock-quantity-detail`) cùng ánh xạ `endingQty → closingQty` và cùng gọi
  `StockPeriodService.aggregate`.
- Cả hai nhánh SQL (`buildItemSqls` grain `item`, `buildAggSqls` grain `parent`/`group`)
  phải cho cùng kết quả.
