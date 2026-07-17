# TKT-PRF-07 FE constants (enum, ReportTableColumn, REPORT_FILTERS_LINE)

## Epic

[EPIC-16072026 Báo cáo lợi nhuận (Profit Reports)](../epics/EPIC-16072026-profit-reports.md)

## Summary

Bổ sung enum + toàn bộ cột/filter mới cần cho 3 báo cáo, trước khi viết registry thật
(TKT-PRF-08). Không đụng logic hiển thị (`ReportPageTable`/`ReportFilterForm`) — chỉ khai
báo dữ liệu tĩnh.

## Deliverables

- `apps/backoffice-web/src/constants/reports/report-type.constant.ts`:
  - Thêm enum `REPORT_TYPE_PROFIT` với 3 key: `PROFIT_BY_ITEM = 'profit_by_item'`,
    `GROSS_PROFIT_BY_INVOICE = 'gross_profit_by_invoice'`,
    `BUSINESS_RESULTS = 'business_results'`.
  - Thêm `REPORT_TYPE_PROFIT_METADATA` với `label` cho từng key (`'Lợi nhuận theo mặt
    hàng'`, `'Báo cáo lợi nhuận gộp theo hoá đơn'`, `'Kết quả kinh doanh'`) — chưa gán
    `filterConfig`/`tableConfig`/`backendKey` (TKT-PRF-08 sẽ hoàn thiện).
- `apps/backoffice-web/src/constants/reports/report-table.constant.ts` — thêm vào
  `ReportTableColumn` (+ label mặc định):
  - `SKU_CODE` ("Mã SKU"), `PROFIT_QUANTITY_SOLD` ("Số lượng bán") — nếu
    `ReportTableColumn.QUANTITY`/tương đương đã tồn tại từ báo cáo sales, tái dùng thay vì
    tạo trùng; chỉ tạo key mới khi khác nghĩa.
  - `COST_OF_GOODS` ("Giá vốn (GV)"), `GROSS_PROFIT` ("Lợi nhuận (LN)"),
    `PROFIT_PER_UNIT` ("Lợi nhuận đơn vị"), `MARGIN_ON_REVENUE` ("Tỷ lệ LN/DT"),
    `MARGIN_ON_COST` ("Tỷ lệ LN/GV") — dùng cho báo cáo #1 (2 biến thể cột theo `statBy`)
    và tái dùng ở #2.
  - `GROSS_GOODS_TOTAL` ("Tổng tiền hàng"), `DISCOUNT_TOTAL` ("Giảm giá") — riêng báo cáo
    #2 (nếu không trùng ý nghĩa với cột `discountAmount` đã có ở báo cáo sales, đặt key
    mới; nếu trùng, tái dùng).
  - `LINE_ITEM_LABEL` ("Khoản mục"), `PERIOD_PREVIOUS` ("Kỳ trước"),
    `PERIOD_CURRENT` ("Kỳ hiện tại"), `PERIOD_CHANGE_PERCENT` ("Thay đổi (%)"),
    `PERIOD_CHANGE_AMOUNT` ("Thay đổi (Số tiền)") — riêng báo cáo #3.
- `apps/backoffice-web/src/constants/reports/report-filters.constant.ts` — thêm vào
  `REPORT_FILTERS_LINE` (+ metadata):
  - `STATISTIC_GROUP_BY_PROFIT` (label "thống kê theo", backendField `statBy`, options
    "Hàng hoá"/"Mẫu mã"/"Nhóm hàng hóa" — nếu `STATISTIC_BY` đã có sẵn cho mục đích tương tự
    ở báo cáo sales nhưng options khác, xác nhận có tái dùng được không trước khi tạo key
    mới trùng lặp).
  - `STORE_IN_CHAIN_OPTIONAL` — đã có từ epic debt-reports, tái dùng nguyên trạng cho cả 3
    báo cáo lợi nhuận (không tạo lại).
  - 2 field filter mới cho báo cáo #3 (xem TKT-PRF-10 để biết chi tiết component UI —
    ticket này chỉ khai báo hằng số): `PERIOD_COMPARE_PREVIOUS` (backendField
    `previousPeriod`), `PERIOD_COMPARE_CURRENT` (backendField `currentPeriod`).

## Acceptance Criteria

- [ ] Không xoá/đổi bất kỳ `ReportTableColumn`/`REPORT_FILTERS_LINE` hiện có (chỉ thêm mới)
      — các báo cáo sales/inventory/debt khác không bị ảnh hưởng.
- [ ] Trước khi thêm cột/filter mới, kiểm tra xem đã có key tương đương từ báo cáo sales
      (`invoice-report`) hay debt-reports chưa — chỉ tạo mới khi thực sự khác nghĩa hoặc
      công thức, tránh trùng lặp không cần thiết.
- [ ] `pnpm --filter @erp/backoffice-web build` (type-check) pass sau khi thêm.

## Definition of Done

- [ ] Diff review xác nhận chỉ thêm, không sửa entry đã có.
- [ ] Không có `TODO`/giá trị rỗng để trống cho các field bắt buộc của interface
      (`ReportColumnConfig`, `ReportTypeMetadata`).

## Tech Approach

Theo đúng format các file hiện có — copy pattern của entry gần nhất khi thêm entry mới, giữ
thứ tự nhóm comment (thêm nhóm comment mới `// === Lợi nhuận ===` nếu chưa có nhóm nào phù
hợp).

## Testing Strategy

- Không cần unit test (thuần khai báo hằng số) — verify bằng type-check.

## Dependencies

- Depends on: TKT-PRF-06 (để `ReportBackendSource` đã có giá trị `"profit"` trước khi wire
  metadata ở TKT-PRF-08 tham chiếu).
- Blocks: TKT-PRF-08.
