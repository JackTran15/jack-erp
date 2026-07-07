# TKT-IVR-01 shared-interfaces: inventory-report contract (labels + payloads + WAREHOUSE option type)

## Epic

[EPIC-06072026 Báo cáo kho hàng theo structure báo cáo bán hàng](../epics/EPIC-06072026-inventory-report-v2.md)

## Summary

Thêm folder `packages/shared-interfaces/src/inventory-report/` chứa toàn bộ contract types + nhãn tiếng Việt cho 8 báo cáo kho, mirror cấu trúc `invoice-report/` sẵn có. Backend source giữ English — mọi chuỗi VI nằm ở đây (pattern đã chốt từ EPIC-11062026). Tái dùng (KHÔNG redefine) `ReportColumnHeader`, `ColumnFilter`, `ReportRow`, `ReportStoreScope` từ `invoice-report/`.

## Deliverables

- `packages/shared-interfaces/src/inventory-report/column.ts` (new):
  - `INVENTORY_REPORT_COLUMN_LABELS_VI: Record<string, string>` — nhãn VI cho toàn bộ fixed column keys của 8 báo cáo (key trùng key FE hiện có trong `report-registry/*.registry.ts` + `_api/inventory-report.api.ts`: `name, parentSku, parentName, color, size, unit, group, brand, sku, positionCode, positionName, openingQty, openingValue, inQty, inValue, outQty, outValue, endingQty, endingValue, transferOutQty, transferOutValue, incomingQty, incomingValue, supplier, date, documentType, warehouse, documentNumber, reference, notes, inUnitPrice, inSalePrice, outUnitPrice, outSalePrice, customer, branchCode, branchName, receiverBranchCode, receiverBranchName, inTotal, inPurchase, inTransfer, inReturn, inWh, inAdjust, inOther, outTotal, outSale, outTransfer, outPurchaseReturn, outWh, outAdjust, outVoid, outOther, branch, total, receivedQty, receivedValue, diffQty, diffValue, inOutDiffQty, inOutDiffValue, targetBranch, outAvgPrice, inAvgPrice, location, time, staff, returnQty, saleQty, remainingQty, status, invoice, ...`).
  - `INVENTORY_REPORT_BAND_LABELS_VI` — `opening: 'Tồn đầu kỳ'`, `in: 'Nhập trong kỳ'`, `out: 'Xuất trong kỳ'`, `ending: 'Tồn cuối kỳ'`, `transferOut: 'Đang chuyển đi'`, `incoming: 'Sắp nhận về'`, `perBranch: 'Tồn theo cửa hàng'` (+ band cần thêm cho báo cáo #2/#3/#6/#7 theo registry FE hiện có).
  - `INVENTORY_DOC_KIND_LABELS_VI` — `GOODS_RECEIPT: 'Phiếu nhập kho mua hàng'`, `GOODS_ISSUE: 'Phiếu xuất kho bán hàng'`, `STOCK_TRANSFER: 'Phiếu điều chuyển kho'` (chuyển từ FE adapter `inventory-report.api.ts:68-72` về vị trí chuẩn).
  - `INVENTORY_REPORT_TYPE_LABELS_VI` — nhãn VI cho 8 backendKey.
  - Dynamic column key helper cho pivot: `INVENTORY_BRANCH_QTY_COLUMN_PREFIX = 'branch.qty.'` + `branchQtyColumnKey(branchId)` / `parseBranchQtyColumnKey(col)`.
- `packages/shared-interfaces/src/inventory-report/search.ts` (new):
  - `InventoryReportFilterPayload` — `{ period?: { from?: string; to?: string }; preset?: string; store?: ReportStoreScope; warehouseIds?: string[]; categoryId?: string; statBy?: 'item' | 'parent' | 'group'; unit?: string; brand?: string; sourceStoreId?: string; receivingStoreIds?: string[]; hideZeroRows?: boolean; search?: string }`.
  - `InventoryReportSearchPayload` — `{ reportType: string; columns: string[]; filters: InventoryReportFilterPayload; columnFilters?: ColumnFilter[]; page?: number; limit?: number }`.
  - `type InventoryReportResult = InvoiceReportResult` (alias — envelope rows/totals/total giống hệt).
- `packages/shared-interfaces/src/invoice-report/options.ts` (edit, additive): thêm enum member `ReportFilterOptionType.WAREHOUSE = 'warehouse'`.
- `packages/shared-interfaces/src/index.ts` (edit): export `inventory-report/`.

## Acceptance Criteria

- [ ] Mọi column key trong label map trùng khớp key FE đang render (đối chiếu `report-registry/*.registry.ts` cho cả 8 báo cáo — không đổi tên key nào).
- [ ] Không redefine type đã có ở `invoice-report/` (chỉ import/re-export).
- [ ] `pnpm --filter @erp/shared-interfaces build` xanh; hai app build không lỗi type.
- [ ] Additive-only với contract invoice-report hiện có (không breaking change cho FE sales).

## Definition of Done

- [ ] `pnpm build:shared` xanh.
- [ ] Không Vietnamese ngoài các label map (backend source sẽ import từ đây).
- [ ] Không TODO/FIXME.

## Tech Approach

Mirror `packages/shared-interfaces/src/invoice-report/` (column.ts / search.ts / options.ts). Pivot dynamic key helper mirror `dynamicColumnKey`/`parseDynamicColumnKey` của invoice-report.

## Testing Strategy

- Type-level: build shared package + 2 app.
- Key-parity check thủ công (hoặc script tạm) giữa label map và các `*.registry.ts` FE.

## Dependencies

- Depends on: —
- Blocks: TKT-IVR-03, TKT-IVR-04, TKT-IVR-05, TKT-IVR-08
