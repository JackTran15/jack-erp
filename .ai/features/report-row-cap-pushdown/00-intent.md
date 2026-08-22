---
feature: report-row-cap-pushdown
slug: report-row-cap-pushdown
owner: Akenzy
created: 2026-08-22
status: draft
---

# Intent — Đẩy phân trang và lọc cột của báo cáo kho v2 xuống SQL

## Problem

Mở "TỔNG HỢP NHẬP XUẤT TỒN KHO" (`/reports/inventory#inventory_in_out_stock_summary`)
với kỳ mặc định "Tháng này" và không lọc gì thì lưới trống, footer bằng 0, và
`POST /reports/inventory/search` trả 400:

```
Report exceeds 50000 rows (74515); narrow the period or filters
```

Người dùng không hề yêu cầu 74515 dòng — lưới đang xin **50 dòng của trang 1**.
Con số 74515 là số cặp (mặt hàng × vị trí kho) của toàn tổ chức; nó lớn hơn 50000
đơn giản vì danh mục đã đủ lớn, và nó sẽ không bao giờ nhỏ lại. Lời khuyên trong
thông báo ("thu hẹp kỳ hoặc bộ lọc") cũng không cứu được: tồn đầu kỳ cần toàn bộ
lịch sử nên thu hẹp kỳ không giảm số dòng, và bộ lọc duy nhất giảm được số dòng là
chọn ít kho hơn — tức là bảo người dùng đừng xem báo cáo toàn chuỗi nữa.

Nguyên nhân không nằm ở truy vấn. Bảy định nghĩa báo cáo kho v2
(`modules/inventory-reports/report/reports/*.report.ts`) đều viết cùng một đoạn:

```ts
const result = await this.<engine>.aggregate({ ..., page: 1, pageSize: MAX_REPORT_ROWS });
assertUnderRowCap(result.total);
let rows = result.data.map(this.toRow);
if (filters.unit) rows = rows.filter(...);      // lọc bằng JS
rows = applyColumnFilters(rows, dto.columnFilters);  // lọc bằng JS
return { rows: paginateRows(rows, ..., dto.page, dto.limit), ... };  // phân trang bằng JS
```

Chúng nạp **toàn bộ** tập kết quả vào RAM rồi mới lọc, cộng tổng và cắt trang bằng
JavaScript. `MAX_REPORT_ROWS` là trần bảo vệ RAM cho đường đó, nên khi tổ chức vượt
50000 dòng thì trần bắn — dù trang người dùng xin chỉ có 50 dòng.

Các engine bên dưới (`StockPeriodService`, `DocumentDetailService`,
`TransferReportService`, `TempWarehouseReportService`) **đã** nhận `page` /
`pageSize` / `columnFilters` và đã trả `total` + `totals` toàn tập tính bằng SQL —
đường GET cũ trong `inventory-reports.service.ts:411-426` vẫn đang dùng đúng như
vậy và không bao giờ chạm trần. Đường v2 chỉ đơn giản là không gọi tới.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Kế toán kho xem báo cáo toàn chuỗi | Bấm "Lấy dữ liệu" → lưới trống + 400 ở Network tab, không có thông báo nào trên màn hình giải thích | Thấy trang 1 và footer tổng toàn tập, thời gian phản hồi không phụ thuộc quy mô danh mục |
| Quản lý chi nhánh lọc theo cột | Lọc được (tổ chức còn dưới trần), nhưng mỗi lần đổi trang server nạp lại cả tập | Lọc và đổi trang đều chạy dưới DB, kết quả không đổi |
| Người xuất khẩu Excel | `/export` và `/print-payload` cũng gọi cùng `buildData` với `limit = 50000` | Không đổi — bản xuất vẫn phải vật chất hoá nên trần vẫn đúng chỗ ở đây |

## Success signal

`POST /reports/inventory/search` cho cả 7 loại báo cáo kho v2 trả 200 với đúng
trang được xin, trên tổ chức có 74515 dòng — nghĩa là 0 lần `assertUnderRowCap`
bắn trên đường `search`. Bộ số (rows / totals / total) khớp từng dòng với đường
JS hiện tại trên tổ chức nhỏ hơn trần.

## Out of scope

- **Bỏ hẳn `MAX_REPORT_ROWS`.** Đường `/export` và `/print-payload` gọi `buildData`
  với `limit = EXPORT_ROW_LIMIT` và thật sự cần cả tập trong RAM; trần vẫn là biện
  pháp bảo vệ đúng ở đó. Feature này chỉ gỡ trần khỏi đường đọc phân trang.
- **Nợ hiệu năng của `buildTotalsSql` và cache key.** `searchCacheKey` băm cả `page`
  nên đổi trang là cache miss, và câu tổng quét `stock_ledger_entries` không có cận
  dưới `posted_at` chỉ để vẽ một dòng footer. Đã khảo sát ở `.ai/debug/stock-summary-perf.md`;
  chủ ý hoãn để diff của lần này chỉ chứa pushdown — đo lại rồi mới quyết.
- **6 nguồn làm sai tồn đầu kỳ** (ngày chứng từ ≠ ngày ghi sổ, huỷ phiếu viết lại quá
  khứ, replay DLQ, cắt kỳ theo UTC…). Là lỗi *số liệu*, không phải lỗi *phân trang*;
  cần migration backfill riêng.
- **Báo cáo ngoài miền kho** (invoice / debt / profit). Chúng có `report-core` riêng
  và chưa có báo cáo lỗi tương tự.
- **Đổi giao diện.** Lưới đã gửi `page` / `limit` / `columnFilters` xuống server rồi;
  không đụng `apps/backoffice-web`.

## Constraints

| Kind | Detail |
|---|---|
| Bất biến | Footer phải là tổng của **toàn tập đã lọc**, không phải của trang. Đây là lý do không được cắt trang bằng cách chỉ hạ `pageSize`. |
| Bất biến | `total` phải là số dòng của toàn tập đã lọc, để lưới vẽ đúng số trang. |
| Song song | Đường GET cũ (`InventoryReportsController`) dùng chung các engine — mọi thay đổi trong `services/*.ts` phải giữ nguyên hành vi cho nó. |
| Cột chưa có SQL | Một nửa số cột của báo cáo hiện chỉ lọc được bằng JS. Quyết định (2026-08-22): mở rộng SQL cho hết, không trả 400 và không giữ hai đường dẫn song song. |
| Từ vựng bộ lọc | v2 gửi `ColumnFilterDto[]` (`{col, contains, gte, …}`); engine nhận `Record<string, ReportColumnFilterDto>` (`{operator, value, from, to}`). Phải có lớp chuyển đổi. |
| Khoá cột | Khoá cột của báo cáo ≠ tên field của engine (`name`→`itemName`, `endingQty`→`closingQty`, `reference`→`referenceNumber`, `inTotal`→`inQty`). |

## Existing surface touched

- **Định nghĩa báo cáo (7)**: `modules/inventory-reports/report/reports/{stock-summary,
  stock-summary-by-store, stock-quantity-detail, stock-by-store-pivot, document-detail,
  transfer-by-store, temp-warehouse-out}.report.ts`
- **Engine (5)**: `modules/inventory-reports/services/{stock-period, stock-balance-pivot,
  document-detail, transfer-report, temp-warehouse-report}.service.ts`
- **Tiện ích dùng chung**: `report/report-data.util.ts` (`applyColumnFilters`,
  `paginateRows`, `buildTotalsRow`), `services/report-column-filter.util.ts`
  (`buildReportColumnFilter`, `ReportColumnSpecs`)
- **Không đụng**: `report-core/row-cap.util.ts` (trần giữ nguyên cho export),
  `inventory-report-v2.controller.ts`, `inventory-report-search.dto.ts`, toàn bộ frontend
- **Tính năng liền kề**: đường GET cũ `inventory-reports.service.ts` — tham chiếu đúng
  của cách gọi engine, và là hồi quy phải canh
