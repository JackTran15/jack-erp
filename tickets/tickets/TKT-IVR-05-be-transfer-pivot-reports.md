# TKT-IVR-05 BE: report definitions #6 (NX điều chuyển), #7 (điều chuyển theo cửa hàng), #5 (tồn kho pivot cột động)

## Epic

[EPIC-06072026 Báo cáo kho hàng theo structure báo cáo bán hàng](../epics/EPIC-06072026-inventory-report-v2.md)

## Summary

3 report definition còn lại: 2 báo cáo điều chuyển và báo cáo pivot tồn theo cửa hàng với **cột động per-branch** (`branch.qty.<branchId>`) — mirror pattern cột động payment-method của `daily-sales-summary.report.ts`.

## Deliverables

Trong `apps/api/src/modules/inventory-reports/report/reports/`:

- `transfer-summary.report.ts` — #6 `inventory-transfer-summary`:
  - Cột: `branchCode, branchName, inQty, inValue, outQty, outValue, receivedQty, receivedValue, diffQty, diffValue, inOutDiffQty, inOutDiffValue`.
  - Data: `TransferReportService` (summary). **Sửa bug tồn tại ở FE adapter cũ:** `inOutDiffQty/Value` map từ `qtyInOutDifference/valueInOutDifference` (adapter cũ map nhầm từ `qtyDifference` — số liệu hiển thị SẼ THAY ĐỔI, đúng; ghi chú release).
- `transfer-by-store.report.ts` — #7 `inventory-transfer-by-store`:
  - Cột: bộ định danh item + `targetBranch, outQty, outAvgPrice, outValue, inQty, inAvgPrice, inValue`; `group` = categoryName THẬT (adapter cũ hardcode "").
  - Data: `TransferReportService` (by branch) với `sourceBranchId = filters.sourceStoreId ?? actor.branchId` — **400 nếu cả hai đều absent**; `destinationBranchIds = filters.receivingStoreIds`; totals: avg-price columns → null (không cộng).
- `stock-by-store-pivot.report.ts` — #5 `inventory-stock-by-store-pivot`:
  - `buildColumns`: cột định danh cố định + `total` + **cột động 1 cột/branch của org** (`BranchEntity` org-scoped, ổn định như `activeAccounts` của daily-sales): key `branch.qty.<branchId>` (helper từ shared-interfaces), `name` = tên branch, type NUMBER, band `perBranch`.
  - `buildData`: `StockBalancePivotService` → map `perBranch[branchId].qty` vào key động; cột động không có data → 0; validate columns lạ qua `parseBranchQtyColumnKey`; totals gồm cả cột động; snapshot hiện tại (không period — như legacy).
- `inventory-reports.module.ts` (edit) — đăng ký 3 definition; `forFeature` BranchEntity nếu chưa có.

## Acceptance Criteria

- [ ] `GET columns?reportType=inventory-stock-by-store-pivot` trả cột động đúng theo branches của org actor (org khác → bộ cột khác); template validation chấp nhận `branch.qty.<id>` hợp lệ, reject id lạ.
- [ ] #6: `inOutDiffQty/Value` từ `qtyInOutDifference/valueInOutDifference`; các cột còn lại giữ mapping cũ.
- [ ] #7: thiếu cả `sourceStoreId` lẫn `actor.branchId` → 400 với message rõ; `receivingStoreIds` lọc đúng.
- [ ] Org-scoped toàn bộ; columnFilters + totals toàn dataset + pagination chuẩn pattern.
- [ ] Cache 45s per-dto.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + lint xanh; spec per-definition (đặc biệt: catalog động #5 per-org, mapping bug-fix #6 có assertion chống regression, 400 case #7).
- [ ] Không đổi SQL engine; legacy regression-free.
- [ ] Không Vietnamese backend source; không TODO/FIXME.

## Tech Approach

#5 mirror khối dynamic columns của `daily-sales-summary.report.ts` (load catalog ổn định → emit header động → map data → validate key động). Chú ý `StockBalancePivotResult.branches` chỉ chứa branch có data — catalog cột lấy từ `BranchEntity` (đầy đủ, ổn định), data map từ `perBranch` (thiếu → 0).

## Testing Strategy

- Unit: fixture 2 org khác branch set → catalog khác nhau; row map cột động đủ/thiếu data; totals cột động; #6 mapping assertions; #7 branch resolution + 400.

## Dependencies

- Depends on: TKT-IVR-03
- Blocks: TKT-IVR-07, TKT-IVR-10
