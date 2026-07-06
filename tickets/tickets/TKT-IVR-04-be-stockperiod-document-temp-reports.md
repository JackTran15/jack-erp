# TKT-IVR-04 BE: report definitions #2 (bảng kê phiếu), #3 (chi tiết SL NXT), #4 (NXT theo cửa hàng), #8 (xuất kho tạm)

## Epic

[EPIC-06072026 Báo cáo kho hàng theo structure báo cáo bán hàng](../epics/EPIC-06072026-inventory-report-v2.md)

## Summary

Thêm 4 report definition tiếp theo vào `InventoryReportRegistry`, theo đúng pattern pilot #1 (TKT-IVR-03): 2 biến thể StockPeriod, bảng kê chứng từ, và xuất kho tạm.

## Deliverables

Tất cả trong `apps/api/src/modules/inventory-reports/report/reports/`:

- `document-detail.report.ts` — #2 `inventory-document-detail`:
  - Cột: `date, documentType, warehouse, documentNumber, reference, sku, name, unit, notes, group, parentSku, parentName, color, size, inQty, inUnitPrice, inValue, inSalePrice, outQty, outUnitPrice, outValue, outSalePrice, customer, branchCode, branchName, receiverBranchCode, receiverBranchName`.
  - Data: `DocumentDetailService`; `documentType` label qua `INVENTORY_DOC_KIND_LABELS_VI` (shared-interfaces); `date` format dd/MM/yyyy (vi-VN, như adapter cũ); `inSalePrice/outSalePrice/branchCode/receiverBranchCode` → null (không có nguồn); totals chỉ `inQty/inValue/outQty/outValue` (unit-price không cộng → null).
- `stock-quantity-detail.report.ts` — #3 `inventory-stock-quantity-detail`:
  - Cột: bộ định danh (như #1, không positionCode/Name nếu registry FE không có) + `openingQty, inTotal, inPurchase, inTransfer, inReturn, inWh, inAdjust, inOther, outTotal, outSale, outTransfer, outPurchaseReturn, outWh, outAdjust, outVoid, outOther, endingQty`.
  - Data: StockPeriodService `includeBreakdown:true`; map breakdown fields (`inQtyPurchase→inPurchase`, `inQtyTransferIn→inTransfer`, `inQtyReturn→inReturn`, `inQtyAdjustIn→inAdjust`, `outQtySale→outSale`, `outQtyTransferOut→outTransfer`, `outQtyAdjustOut→outAdjust`); `inWh, inOther, outPurchaseReturn, outWh, outVoid, outOther` → null (không có movement subtype).
- `stock-summary-by-store.report.ts` — #4 `inventory-stock-summary-by-store`:
  - Cột: bộ định danh + `branchCode, branch` + cặp opening/in/out/ending qty+value.
  - Data: StockPeriodService `groupBy:'item_branch'`; `branch` = branchName; `branchCode` null (bảng branches không có code — documented).
- `temp-warehouse-out.report.ts` — #8 `inventory-temp-warehouse-out`:
  - Cột: `sku, name, unit, location, date, time, staff, outQty, returnQty, saleQty, remainingQty, status, invoice` — near-passthrough `TempWarehouseIssueRow`.
  - Data: `TempWarehouseReportService`; totals `outQty/returnQty/saleQty/remainingQty`.
- `inventory-reports.module.ts` (edit) — đăng ký 4 definition vào registry factory.

## Acceptance Criteria

- [ ] 4 reportType mới xuất hiện qua `GET columns` + `POST search`; key cột trùng khớp registry FE tương ứng (`report-warehouse-voucher-detail-list.registry.ts`, `report-inventory-in-out-stock-quantity-detail.registry.ts`, `report-store-inventory-in-out-stock-summary.registry.ts`, `report-temporary-warehouse-out-goods.registry.ts`).
- [ ] Org-scoped + branch scope theo `filters.store`; columnFilters + totals-toàn-bộ + pagination như pilot.
- [ ] #3: các cột breakdown có nguồn map đúng; cột không nguồn trả null nhất quán (không phải 0 giả).
- [ ] #2: `group` (categoryName) có giá trị thật; label documentType đúng VI map.
- [ ] Cache 45s per-dto.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + lint xanh; spec per-definition (catalog + mapping + null policy + totals) với engine mock.
- [ ] Không đổi SQL engine services; legacy endpoints regression-free.
- [ ] Không Vietnamese trong backend source; không TODO/FIXME.

## Tech Approach

Mỗi definition ~100-150 dòng theo khuôn pilot: catalog constant + `buildData` = resolve scope → engine → map → filter → totals → slice. Verify trong lúc implement: `DocumentDetailRow` có trả `color/size` không (risk #1 của epic) — nếu SQL không select thì trả null, KHÔNG tự chế heuristic mới.

## Testing Strategy

- Unit per definition: 1 spec file / report, fixture engine rows → assert keyed row đầy đủ cột, null policy, totals đúng trên fixture nhiều trang.

## Dependencies

- Depends on: TKT-IVR-03
- Blocks: TKT-IVR-07, TKT-IVR-10
