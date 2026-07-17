# TKT-PRF-08 FE report registries (3 báo cáo)

## Epic

[EPIC-16072026 Báo cáo lợi nhuận (Profit Reports)](../epics/EPIC-16072026-profit-reports.md)

## Summary

Viết 3 file registry dưới `report-registry/` theo đúng mẫu các registry debt-reports/sales,
rồi wire vào `REPORT_TYPE_PROFIT_METADATA` (`backendKey` + `backendSource: "profit"` +
`filterConfig`/`tableConfig` theo `STORE_TYPE.SINGLE`/`CHAIN`).

## Deliverables

- `report-registry/report-profit-by-item.registry.ts`:
  - Filter — **`single_filterRegistry`** (single-store, không có field "Cửa hàng"):
    `STATISTIC_GROUP_BY_PROFIT`, `PRODUCT_GROUP`/`categoryId`, `REPORT_PERIOD`,
    `RANGE_DATE`.
  - Filter — **`chain_filterRegistry`** (thêm `STORE_IN_CHAIN_OPTIONAL`, mặc định
    "Chuỗi cửa hàng"): `STORE_IN_CHAIN_OPTIONAL`, `STATISTIC_GROUP_BY_PROFIT`,
    `PRODUCT_GROUP`, `REPORT_PERIOD`, `RANGE_DATE`.
  - Table — **2 biến thể theo `statBy`** (khác nhau hoàn toàn về cột, xem TKT-PRF-02):
    - `item`/`parent`: `SKU_CODE`(pin), `itemName`(pin), `unit`, `quantity`, `revenue`,
      `COST_OF_GOODS`, `GROSS_PROFIT`, `PROFIT_PER_UNIT`, `MARGIN_ON_REVENUE`,
      `MARGIN_ON_COST`, `categoryName`.
    - `group`: `categoryCode`, `categoryName`, `revenue`, `COST_OF_GOODS`, `GROSS_PROFIT`,
      `MARGIN_ON_REVENUE`, `MARGIN_ON_COST`.
    - BE đã trả `buildColumns()` đầy đủ theo `statBy` (TKT-PRF-02) — registry FE ở đây chỉ
      là lưới an toàn dự phòng khi BE trả rỗng, KHÔNG phải nguồn cột chính (xem lưu ý
      TKT-PRF-06).
  - `backendKey: "profit-by-item"`, `backendSource: "profit"`.
- `report-registry/report-gross-profit-by-invoice.registry.ts`:
  - Filter — single: `REPORT_PERIOD`, `RANGE_DATE`. Chain: thêm
    `STORE_IN_CHAIN_OPTIONAL` ở đầu.
  - Table: `date`(pin), `GROSS_GOODS_TOTAL`, `DISCOUNT_TOTAL`, `revenue`, `COST_OF_GOODS`,
    `GROSS_PROFIT`. Không có cột khách hàng/thu ngân/NV bán hàng (đã xác nhận không có
    trong spec BE).
  - `backendKey: "gross-profit-by-invoice"`, `backendSource: "profit"`.
- `report-registry/report-business-results.registry.ts`:
  - Filter — single: `PERIOD_COMPARE_PREVIOUS`, `PERIOD_COMPARE_CURRENT`. Chain: thêm
    `STORE_IN_CHAIN_OPTIONAL` ở đầu — component UI thật cho 2 filter period-compare được
    build ở TKT-PRF-10, ticket này chỉ khai báo registry tham chiếu tới field key đó.
  - Table: `LINE_ITEM_LABEL`(pin), `PERIOD_PREVIOUS`, `PERIOD_CURRENT`,
    `PERIOD_CHANGE_PERCENT`, `PERIOD_CHANGE_AMOUNT`. Không có `summaryLabel` (báo cáo #3
    không có dòng Tổng ở footer — dòng "IV. Lợi nhuận" trong `rows` đã là dòng tổng).
  - `backendKey: "business-results"`, `backendSource: "profit"`.
- Wire cả 3 vào `REPORT_TYPE_PROFIT_METADATA` trong `report-type.constant.ts` (import
  registry, set `filterConfig`/`tableConfig` cho cả `STORE_TYPE.SINGLE` và
  `STORE_TYPE.CHAIN`).

## Acceptance Criteria

- [ ] `getReportFormLines(reportType, branch)` trả đúng filter cho cả 3 báo cáo ở cả 2 chế
      độ SINGLE/CHAIN.
- [ ] `getReportTableConfig(reportType, branch)` trả đúng cột cho cả 3 báo cáo (báo cáo #1:
      đúng bộ cột theo `statBy` đang chọn).
- [ ] Cả 3 báo cáo: filter "Cửa hàng" **chỉ xuất hiện** ở `chain_filterRegistry`, không
      xuất hiện ở `single_filterRegistry` — verify đúng theo screenshot mẫu (khác hẳn
      debt-reports #1/#2 vốn không có filter này ở cả 2 chế độ).
- [ ] Báo cáo #3: không có `summaryLabel`/dòng Tổng footer (khác 2 báo cáo còn lại và mọi
      báo cáo khác trong hệ thống).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Test thủ công trong preview (`preview_start`): mở `/reports/profit`, chọn lần lượt 3
      báo cáo, xác nhận dialog filter đúng field, bảng đúng cột (so ảnh mẫu đã cung cấp
      trong phiên plan). Riêng báo cáo #1: đổi `Thống kê theo` giữa 3 lựa chọn, xác nhận
      cột đổi đúng theo từng lựa chọn.

## Tech Approach

Copy nguyên cấu trúc từ 1 registry debt-reports gần nhất: mỗi registry export 4 const
(`single_filterRegistryXxx`, `chain_filterRegistryXxx`, `single_tableRegistryXxx`,
`chain_tableRegistryXxx`), column entries dùng `ReportColumnConfig` với
`tableConfig: { width, pinned, align, dataType, filterKind }`.

Báo cáo #1 cần thêm 1 lớp gián tiếp: `single_tableRegistryReportProfitByItem` không phải 1
mảng cột cố định mà là hàm `(statBy) => ReportColumnConfig[]` trả 1 trong 2 bộ cột — xác
nhận cách `getReportTableConfig` hiện tại có hỗ trợ table config dạng hàm/động theo filter
hay chỉ hỗ trợ mảng tĩnh; nếu chỉ hỗ trợ tĩnh, dựa hoàn toàn vào cột BE trả về
(`ReportTableConfigSync` đã ưu tiên BE — xem TKT-PRF-06) và registry FE chỉ cần khai báo bộ
cột đầy đủ nhất (item-level) làm fallback.

## Testing Strategy

- Không cần unit test (khai báo tĩnh) — verify bằng preview thủ công + type-check.

## Dependencies

- Depends on: TKT-PRF-07.
- Blocks: TKT-PRF-09, TKT-PRF-10.
