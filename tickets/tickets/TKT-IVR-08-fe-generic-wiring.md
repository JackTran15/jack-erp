# TKT-IVR-08 FE: generic wiring 8 báo cáo kho (backendSource routing + dropdown thật + xoá adapter/mock)

## Epic

[EPIC-06072026 Báo cáo kho hàng theo structure báo cáo bán hàng](../epics/EPIC-06072026-inventory-report-v2.md)

## Summary

Chuyển 8 báo cáo kho trong chain-store `ReportPage` từ custom fetchers sang generic path (như 4 báo cáo bán hàng): columns từ backend catalog, search keyed-rows + columnFilters + totals backend, dropdown filter thật qua `/reports/inventory/filter-options`. Xoá adapter cũ + mock.

## Deliverables

- `apps/backoffice-web/src/constants/reports/report-type.constant.ts` (edit) — thêm `backendKey` (bảng map trong epic) + `backendSource: 'inventory'` vào metadata 8 report kho (sales default `'invoice'`); export `getReportBackendSource(reportType)`.
- `apps/backoffice-web/src/pages/chain-store/reports/_api/inventory-report-v2.api.ts` (new):
  - `fetchInventoryReportColumns(reportType)` → `GET /reports/inventory/columns`.
  - `fetchInventoryReportData(payload)` → `POST /reports/inventory/search`.
  - `buildInventorySearchFilters(filters)` — map `REPORT_FILTERS_LINE.{STORE, STORE_SINGLE, WAREHOUSE→warehouseIds, PRODUCT_GROUP→categoryId, STATISTIC_BY→statBy, UNIT→unit, BRAND→brand, SOURCE_STORE→sourceStoreId, RECEIVING_STORE→receivingStoreIds, REPORT_PERIOD→preset, RANGE_DATE→period}` → `InventoryReportFilterPayload` (strip sentinel `__all__`).
  - Tái dùng `mapHeadersToTableConfig` + `buildColumnFilters` từ `invoice-report.api.ts` (đã generic).
- `_api/report-data-source.ts` (edit) — XOÁ `CUSTOM_FETCHERS` + import block; `getReportDataFetcher` route theo `backendSource` (invoice → fetcher cũ, inventory → fetcher mới).
- `ReportTableConfigSync/ReportTableConfigSync.tsx` (edit) — chọn columns fetch theo `backendSource`; giữ fallback static registry khi BE trả rỗng/lỗi (safety net).
- `_api/report-filter-options.api.ts` / hook options (edit) — nhận endpoint base theo report category; báo cáo kho gọi `/reports/inventory/filter-options` (types: store, warehouse, productGroup, brand, unit, statBy, productType).
- `ReportFilterLine.tsx` (edit) — `WAREHOUSE` → `RemoteSelectField type='warehouse'`; `RECEIVING_STORE` → `RemoteSelectField type='store'`; inline `workShiftOptions` (đang import từ mock nhưng không thuộc inventory).
- **Delete:** `_api/inventory-report.api.ts` (8 custom fetchers), `ReportSelector/_mock/report-inventory-filter.mock.ts`.
- **Không đụng:** `api/inventory-reports.ts`, `pages/reports/storage/*`, `report-registry/*.registry.ts`.

## Acceptance Criteria

- [ ] Cả 8 báo cáo kho render cột từ backend catalog (không rơi fallback khi API khỏe); band headers đúng.
- [ ] Footer "Tổng" = totals từ backend (đúng trên toàn dataset, đổi trang không đổi tổng).
- [ ] Lọc theo cột (FilterHeaderCell) hoạt động cho báo cáo kho (number + text operators).
- [ ] Mọi dropdown filter kho là data thật org hiện tại; không còn import nào từ mock file đã xoá (`grep` sạch).
- [ ] Báo cáo bán hàng không regression (path invoice không đổi).
- [ ] Strings hiển thị tiếng Việt; số/ngày format `vi-VN`.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh; typecheck sạch.
- [ ] Unit test `buildInventorySearchFilters` (mapping matrix + sentinel strip).
- [ ] Verify thủ công 8/8 báo cáo trên dev (screenshot trong PR).
- [ ] Không TODO/FIXME.

## Tech Approach

Named exports, props interface riêng, TanStack Query cho columns/options (`queryKey` bắt đầu bằng resource: `["inventory-report-columns", backendKey]`...). Không đưa server data vào Zustand — chỉ giữ pattern store hiện có của ReportPage.

## Testing Strategy

- Unit mapper; smoke từng báo cáo trên dev server với seed data (`pnpm seed:inventory`).

## Dependencies

- Depends on: TKT-IVR-07
- Blocks: TKT-IVR-10
