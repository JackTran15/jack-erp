# TKT-DBT-08 FE constants (enum, ReportTableColumn, REPORT_FILTERS_LINE)

## Epic

[EPIC-15072026 Báo cáo công nợ (Debt Reports)](../epics/EPIC-15072026-debt-reports.md)

## Summary

Bổ sung key enum còn thiếu + toàn bộ cột/filter mới cần cho 4 báo cáo, trước khi
viết registry thật (TKT-DBT-09). Không đụng logic hiển thị (`ReportPageTable`/
`ReportFilterForm`) — chỉ khai báo dữ liệu tĩnh.

## Deliverables

- `apps/backoffice-web/src/constants/reports/report-type.constant.ts`:
  - Thêm `CUSTOMER_DEBTS = 'customer_debts'` vào enum `REPORT_TYPE_DEBTS`.
  - Thêm entry `[REPORT_TYPE_DEBTS.CUSTOMER_DEBTS]: { label: 'Công nợ khách hàng' }`
    vào `REPORT_TYPE_DEBTS_METADATA` (chưa gán `filterConfig`/`tableConfig`/
    `backendKey` — TKT-DBT-09 sẽ hoàn thiện).
- `apps/backoffice-web/src/constants/reports/report-table.constant.ts` — thêm vào
  `ReportTableColumn` (+ `ReportTableColumnLabel`, override `label` per-registry
  khi cần khác nhãn mặc định):
  - `CUSTOMER_EMAIL` ("Email").
  - `MEMBERSHIP_CARD_NUMBER` ("Mã thẻ thành viên"), `MEMBERSHIP_TIER` ("Hạng thẻ").
  - `DEBT_OPENING` ("Nợ đầu kỳ"), `DEBT_INCREASE` ("Tăng trong kỳ"),
    `DEBT_DECREASE` ("Giảm trong kỳ"), `DEBT_CLOSING` ("Nợ cuối kỳ") — dùng chung
    cho báo cáo #1 và #3 (period-ledger dạng tổng hợp theo party).
  - `DOCUMENT_TYPE` ("Loại chứng từ"), `DOCUMENT_DESCRIPTION` ("Diễn giải") — dùng
    chung cho báo cáo #2 và #4 (dạng chi tiết theo chứng từ); mỗi registry override
    `label` nếu cần khác biệt nhỏ.
  - `LINE_DEBT_INCREASE` ("Nợ tăng"), `LINE_DEBT_DECREASE` ("Nợ giảm"),
    `LINE_COLLECTED_AMOUNT` ("Đã thu"), `RUNNING_BALANCE` ("Số dư cuối kỳ") — riêng
    cho báo cáo #2 (delta/dòng + số dư luỹ kế theo dòng — **khác** `DEBT_*` ở trên
    về mặt công thức, đặt tên riêng để tránh nhầm khi code BE/FE).
  - `CUMULATIVE_DEBT_INCREASE` ("Công nợ tăng trong kỳ"),
    `CUMULATIVE_DEBT_DECREASE` ("Công nợ giảm trong kỳ") — riêng cho báo cáo #4
    (luỹ kế từ đầu kỳ đến dòng hiện tại — khác cả 2 nhóm trên, xem cảnh báo trong
    `docs/24-debt-reports-spec.md` mục 4 về rủi ro nhầm công thức).
  - `DISCOUNT_PERCENT` ("% CK"), `DISCOUNT_AMOUNT` ("Tiền CK"), `TAX_RATE` ("Thuế
    suất"), `TAX_AMOUNT` ("Tiền thuế"), `PAYMENT_AMOUNT` ("Tiền thanh toán") — báo
    cáo #4 (giá trị luôn 0 ở BE đợt này, vẫn cần khai báo cột đúng theo mẫu).
- `apps/backoffice-web/src/constants/reports/report-filters.constant.ts` — thêm
  vào `REPORT_FILTERS_LINE` (+ `REPORT_FILTERS_LINE_METADATA`):
  - `CUSTOMER_GROUP` (label "nhóm khách hàng", backendField `customerGroupId`,
    KHÔNG `isRequired`).
  - `SUPPLIER` (label "nhà cung cấp", backendField `supplierId`, `isRequired: true`
    — dùng cho báo cáo #2/#4, tương tự cách `CUSTOMER` đang được dùng).
  - `SUPPLIER_GROUP` (label "nhóm nhà cung cấp", backendField `supplierGroupId`).
  - `STATISTIC_GROUP_BY_ITEM_OR_TEMPLATE` (label "thống kê theo", backendField
    `groupBy`, options "Hàng hóa"/"Mẫu mã" — chỉ dùng ở báo cáo #4).
  - `STORE_IN_CHAIN_OPTIONAL` (label "cửa hàng", backendField `branchId`, KHÔNG
    `isRequired`, mặc định value = sentinel "chuỗi cửa hàng"/gộp — chỉ hiện khi
    `STORE_TYPE.CHAIN`, dùng ở báo cáo #3/#4).

## Acceptance Criteria

- [ ] `REPORT_TYPE_DEBTS` có đủ 6 key như hiện trạng cũ + `CUSTOMER_DEBTS` (5 key
      cũ giữ nguyên, không đổi tên/giá trị đang có — tránh phá registry đã tồn tại
      cho các key khác nếu có tham chiếu ở nơi khác).
- [ ] Không xoá/đổi bất kỳ `ReportTableColumn`/`REPORT_FILTERS_LINE` hiện có (chỉ
      thêm mới) — các báo cáo sales/inventory khác không bị ảnh hưởng.
- [ ] `pnpm --filter @erp/backoffice-web build` (type-check) pass sau khi thêm.

## Definition of Done

- [ ] Diff review xác nhận chỉ thêm, không sửa entry đã có.
- [ ] Không có `TODO`/giá trị rỗng để trống cho các field bắt buộc của interface
      (`ReportColumnConfig`, `ReportTypeMetadata`).

## Tech Approach

Theo đúng format 2 file hiện có — copy pattern của các entry gần nhất
(`ReportTableColumn.CUSTOMER_PHONE`, `REPORT_FILTERS_LINE.CUSTOMER`) khi thêm entry
mới, giữ thứ tự nhóm comment (`// === Khách hàng ===`, `// === Công nợ ===` — có
thể cần thêm nhóm comment mới `// === Công nợ ===` trong `ReportTableColumn` nếu
chưa có, đặt cạnh nhóm `// === Thực thu & Công nợ ===` đã tồn tại).

## Testing Strategy

- Không cần unit test (thuần khai báo hằng số) — verify bằng type-check.

## Dependencies

- Depends on: TKT-DBT-07 (để `ReportBackendSource` đã có giá trị `"debt"` trước
  khi wire metadata ở TKT-DBT-09 tham chiếu).
- Blocks: TKT-DBT-09.
