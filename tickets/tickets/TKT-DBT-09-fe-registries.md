# TKT-DBT-09 FE report registries (4 báo cáo)

## Epic

[EPIC-15072026 Báo cáo công nợ (Debt Reports)](../epics/EPIC-15072026-debt-reports.md)

## Summary

Viết 4 file registry dưới `report-registry/` theo đúng mẫu
`report-revenue-detail-by-invoice-and-product.registry.ts`, rồi wire vào
`REPORT_TYPE_DEBTS_METADATA` (`backendKey` + `backendSource: "debt"` +
`filterConfig`/`tableConfig` theo `STORE_TYPE.SINGLE`/`CHAIN`).

## Deliverables

- `report-registry/report-customer-debts.registry.ts`:
  - Filter (single & chain giống nhau, không phân biệt SINGLE/CHAIN vì báo cáo
    này luôn gộp toàn tổ chức bất kể chế độ xem — xem Scope epic):
    `REPORT_FILTERS_LINE.REPORT_PERIOD`, `RANGE_DATE`.
  - Table: `CUSTOMER_CODE`(pin), `CUSTOMER_NAME`(pin, link), `CUSTOMER_GROUP`,
    `CUSTOMER_PHONE`, `CUSTOMER_EMAIL`, `DEBT_OPENING`, `DEBT_INCREASE`,
    `DEBT_DECREASE`, `DEBT_CLOSING`, `ReportTableColumn.STORE_NAME`(nếu cần hiển
    thị "Chi nhánh" — xác nhận lại khi so sánh với ảnh mẫu, doc #1 không liệt kê
    cột này), `address` (dùng field tự do, không có `ReportTableColumn` riêng —
    map trực tiếp `backendField: "address"`), `MEMBERSHIP_CARD_NUMBER`,
    `MEMBERSHIP_TIER`. `summaryLabel: "Tổng"`.
  - `backendKey: "customer-debts"`, `backendSource: "debt"`.
- `report-registry/report-receivables-detail-by-product.registry.ts`:
  - Filter: `CUSTOMER_GROUP`, `REPORT_FILTERS_LINE.CUSTOMER`(bắt buộc),
    `REPORT_PERIOD`, `RANGE_DATE`, `STORE`/`STORE_SINGLE` (cấp trang, không đổi).
  - Table (18 cột theo đúng thứ tự doc mục 2): `date`(pin), `documentNumber`(pin,
    link), `DOCUMENT_TYPE`, `DOCUMENT_DESCRIPTION`, `SKU`, `PRODUCT_NAME`,
    `PRODUCT_GROUP`, `UNIT`, `QUANTITY`, `UNIT_PRICE`, `REVENUE_GOODS`,
    `REVENUE_PROMOTION`, `REVENUE_TOTAL`(hoặc cột mới `total`),
    `LINE_COLLECTED_AMOUNT`, `LINE_DEBT_INCREASE`, `LINE_DEBT_DECREASE`,
    `RUNNING_BALANCE`, `STORE_NAME`. `summaryLabel: "Tổng"`.
  - `backendKey: "receivables-detail-by-product"`, `backendSource: "debt"`.
- `report-registry/report-supplier-debts.registry.ts`:
  - Filter: `SUPPLIER_GROUP`, `REPORT_PERIOD`, `RANGE_DATE`,
    `STORE_IN_CHAIN_OPTIONAL` (chỉ áp dụng ở `chain_filterRegistry`, KHÔNG có
    trong `single_filterRegistry` — khớp xác nhận "chỉ hiện khi xem Chuỗi cửa
    hàng").
  - Table: `SUPPLIER_CODE`(pin, mặc định hiển thị), `SUPPLIER_NAME`(pin, mặc định
    hiển thị), `DEBT_OPENING`, `DEBT_INCREASE`, `DEBT_DECREASE`, `DEBT_CLOSING`
    (4 cột số **không pin**). `summaryLabel: "Tổng"`.
  - `backendKey: "supplier-debts"`, `backendSource: "debt"`.
- `report-registry/report-supplier-debts-detail-by-document-and-product.registry.ts`:
  - Filter: `STORE_IN_CHAIN_OPTIONAL` (chain only),
    `STATISTIC_GROUP_BY_ITEM_OR_TEMPLATE`, `SUPPLIER_GROUP`,
    `REPORT_FILTERS_LINE.SUPPLIER`(bắt buộc), `REPORT_PERIOD`, `RANGE_DATE`.
  - Table: 2 biến thể theo `groupBy` — **quyết định ở đây là FE table config tĩnh
    hay động theo response?** Xem AC bên dưới; mặc định implement **1 bộ cột tĩnh
    đầy đủ** (20 cột, chế độ "Hàng hóa"), ẩn cột rỗng khi response không trả field
    tương ứng (chế độ "Mẫu mã") — tái dùng cơ chế hiện có của bảng báo cáo (cột
    không có data → để trống, không cần đổi `tableConfig` runtime).
  - `backendKey: "supplier-debts-detail-by-document-and-product"`,
    `backendSource: "debt"`.
- Wire cả 4 vào `REPORT_TYPE_DEBTS_METADATA` trong `report-type.constant.ts`
  (import registry, set `filterConfig`/`tableConfig` cho cả `STORE_TYPE.SINGLE`
  và `STORE_TYPE.CHAIN`).

## Acceptance Criteria

- [ ] `getReportFormLines(reportType, branch)` trả đúng filter cho cả 4 báo cáo ở
      cả 2 chế độ SINGLE/CHAIN.
- [ ] `getReportTableConfig(reportType, branch)` trả đúng cột cho cả 4 báo cáo.
- [ ] Báo cáo #1/#2: filter KHÔNG có option chọn cửa hàng cụ thể để giới hạn dữ
      liệu (đúng theo quyết định "luôn gộp toàn bộ chi nhánh").
- [ ] Báo cáo #3/#4: filter phụ "Cửa hàng" **chỉ xuất hiện** ở `chain_filterRegistry`,
      không xuất hiện ở `single_filterRegistry`.
- [ ] `REPORT_FILTERS_LINE.CUSTOMER`/`SUPPLIER` ở báo cáo #2/#4 hiển thị đúng dấu
      bắt buộc (`*`) trên UI.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Test thủ công trong preview (`preview_start`): mở `/reports/debts`, chọn lần
      lượt 4 báo cáo, xác nhận dialog filter đúng field, bảng đúng cột (so ảnh mẫu
      trong `docs/24-debt-reports-spec.md`).

## Tech Approach

Copy nguyên cấu trúc từ
`report-revenue-detail-by-invoice-and-product.registry.ts` (đã đọc khi khảo sát):
mỗi registry export 4 const (`single_filterRegistryXxx`,
`chain_filterRegistryXxx`, `single_tableRegistryXxx`, `chain_tableRegistryXxx`),
column entries dùng `ReportColumnConfig` với `tableConfig: { width, pinned, align,
dataType, link, filterKind }`.

## Testing Strategy

- Không cần unit test (khai báo tĩnh) — verify bằng preview thủ công +
  type-check.

## Dependencies

- Depends on: TKT-DBT-08.
- Blocks: TKT-DBT-10.
