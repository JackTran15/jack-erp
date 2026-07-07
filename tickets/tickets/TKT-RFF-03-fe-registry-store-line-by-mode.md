# TKT-RFF-03 FE: registry single/chain — dòng "Cửa hàng" theo mode (+ STORE cho #3 chain)

## Epic

[EPIC-06072026 Report filter theo mode + kho phụ thuộc cửa hàng](../epics/EPIC-06072026-report-filter-store-warehouse.md)

## Summary

Tách `single_filterRegistry*` vs `chain_filterRegistry*` cho các báo cáo kho có dòng "Cửa hàng" (hiện 2 export trỏ chung 1 mảng): **CHAIN** giữ dòng `STORE` (multi-select), **SINGLE** bỏ dòng `STORE` (cửa hàng cố định = chi nhánh header). Thêm `STORE` vào #3 (chain) — backend #3 đã honor `filters.store`.

## Deliverables

Sửa `filterLines` trong 4 registry (tách 2 biến `singleFilterLines`/`chainFilterLines` thay vì 1 `filterLines` chung; giữ nguyên thứ tự, chỉ bỏ/thêm `REPORT_FILTERS_LINE.STORE`):

- `.../report-registry/report-inventory-in-out-stock-summary.registry.ts` (#1): chain = `[STORE, WAREHOUSE, PRODUCT_GROUP, STATISTIC_BY, UNIT, REPORT_PERIOD, RANGE_DATE]`; single = **bỏ STORE**.
- `.../report-registry/report-warehouse-voucher-detail-list.registry.ts` (#2): chain = `[STORE, PRODUCT_GROUP, REPORT_PERIOD, RANGE_DATE]`; single = **bỏ STORE**.
- `.../report-registry/report-inventory-in-out-stock-quantity-detail.registry.ts` (#3): chain = **thêm STORE ở đầu** → `[STORE, WAREHOUSE, PRODUCT_GROUP, STATISTIC_BY, UNIT, REPORT_PERIOD, RANGE_DATE]`; single = giữ nguyên (không STORE).
- `.../report-registry/report-transfer-in-out-summary.registry.ts` (#6): chain = `[STORE, REPORT_PERIOD, RANGE_DATE]`; single = **bỏ STORE**.

Mỗi file đổi 2 export:
```ts
const chainFilterLines = [REPORT_FILTERS_LINE.STORE, ...rest];
const singleFilterLines = [...rest]; // bỏ STORE
export const single_filterRegistry...= singleFilterLines;
export const chain_filterRegistry... = chainFilterLines;
```
Table config (`single_tableRegistry*`/`chain_tableRegistry*`) **không đổi** — cột giống nhau 2 mode.

## Acceptance Criteria

- [ ] Header "Chuỗi" (CHAIN): #1/#2/#3/#6 hiện dòng "Cửa hàng" (StoreScope multi-select); #3 giờ có cả Cửa hàng + Kho.
- [ ] Header 1 chi nhánh (SINGLE): #1/#2/#3/#6 **không** hiện dòng "Cửa hàng"; các dòng còn lại (Kho/Nhóm/Kỳ…) giữ nguyên.
- [ ] Không đổi báo cáo #4/#5/#7/#8 (không nằm trong nhóm split).
- [ ] Không đổi table columns 2 mode.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh; typecheck sạch.
- [ ] Không TODO/FIXME.

## Tech Approach

`ReportPage` đã chọn `configs = REPORT_CATEGORY_METADATA[category].configs[branch]` theo `useIsChainSelected()`; `getReportFormLines` đọc `filterConfig[branch]`. Chỉ cần 2 mảng filter-lines khác nhau per registry là dòng Cửa hàng ẩn/hiện đúng mode. Không đụng component render (`ReportFilterLine` STORE case giữ nguyên — chỉ khác là SINGLE không có line này để render).

## Testing Strategy

- Manual (RFF-05): toggle header chain↔single, verify dòng Cửa hàng ẩn/hiện đúng ở 4 báo cáo.

## Dependencies

- Depends on: —
- Blocks: TKT-RFF-04 (scoping/cascade phụ thuộc mode + sự có/không của dòng STORE).
