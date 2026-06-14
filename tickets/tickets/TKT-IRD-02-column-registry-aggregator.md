# TKT-IRD-02 BE: Registry cột per-line-item + aggregator/row-builder (JS)

## Epic

[EPIC-14062026 Chi tiết doanh thu theo hóa đơn và mặt hàng](../epics/EPIC-14062026-invoice-item-revenue-detail-report.md)

## Summary

Dựng registry cột **per-line-item** riêng + aggregator/row-builder thuần JS cho report `invoice-item-revenue-detail`, tách khỏi registry per-day (`invoice-report.columns.ts`) và per-invoice (`invoice-listing.columns.ts`). Catalog **phẳng** (không band), **không** cột động payment-method.

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/invoice-item-revenue.columns.ts` (mới) — `INVOICE_ITEM_REVENUE_COLUMNS: ItemRevenueColumnDef[]` (key + type + classification `backed`/`derived`/`placeholder` + `source`), helper `isKnownItemRevenueColumn`, `getItemRevenueColumnDef`.
- `apps/api/src/modules/reporting/invoice-report/invoice-item-revenue.aggregator.ts` (mới) — `InvoiceItemRowInput` (line + invoice header + relations inline), `itemCellValue`, `itemColumnType`, `buildItemRow`, `buildItemTotals`.
- Specs: `invoice-item-revenue.columns.spec.ts`, `invoice-item-revenue.aggregator.spec.ts`.

## Acceptance Criteria

- [ ] Registry khai báo đúng bộ cột MISA theo thứ tự màn hình; mọi cột `group: null` (phẳng).
- [ ] Classification đúng: `lineAmount` = `derived` (`quantity*unitPrice`); `revenue.promoPoints`/`reference`/`payment.bankAccount`/`salesChannel`/`receiver`/`receiverPhone` = `placeholder` (0/null); còn lại `backed`.
- [ ] `itemCellValue`: đọc field line/invoice (tách date/time từ `issuedAt`), relation inline, derive `lineAmount`, placeholder tất định.
- [ ] `buildItemRow`: trả `ReportCell[]` theo đúng thứ tự cột yêu cầu.
- [ ] `buildItemTotals`: tổng cột currency/number **trừ** `unitPrice` (đơn giá không có tổng nghĩa); cột chuỗi/ngày = null.
- [ ] `storeCode` và `storeName` cùng resolve `branches.name`.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- invoice-item-revenue.columns invoice-item-revenue.aggregator` xanh.
- [ ] Không tiếng Việt trong source (trừ fixture test); không phụ thuộc registry/report khác.

## Dependencies

- Depends on: TKT-IRD-01
- Blocks: TKT-IRD-03, TKT-IRD-05
