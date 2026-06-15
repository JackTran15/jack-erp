# TKT-IRD-01 Shared: nhãn VI report type + cột mới + 3 filter optional

## Epic

[EPIC-14062026 Chi tiết doanh thu theo hóa đơn và mặt hàng](../epics/EPIC-14062026-invoice-item-revenue-detail-report.md)

## Summary

Mở rộng contract `@erp/shared-interfaces/invoice-report` (thuần additive) cho report type thứ 3: thêm nhãn VI report type, nhãn VI các cột line-item mới, và 3 filter optional (customer/cashier/salesperson) vào payload filter dùng chung.

## Deliverables

- `packages/shared-interfaces/src/invoice-report/report-type.ts` — thêm `'invoice-item-revenue-detail': 'Chi tiết doanh thu theo hóa đơn và mặt hàng'` vào `REPORT_TYPE_LABELS_VI`.
- `packages/shared-interfaces/src/invoice-report/column.ts` — thêm nhãn VI cho các key cột mới vào `INVOICE_REPORT_COLUMN_LABELS_VI`: `sku`, `itemName`, `itemCategory`, `unit`, `quantity`, `unitPrice`, `lineAmount`, `lineDiscount`, `lineRevenue`, `reference`, `locationCode`, `locationName`, `customerCode`, `customerGroup`, `cashierCode`, `salespersonCode`, `receiver`, `receiverPhone`, `storeName`, `invoiceNote`, `itemNote`, `supplier`. (Tái dùng key sẵn có: `date`, `time`, `invoiceCode`, `customer`, `customerPhone`, `salesChannel`, `cashier`, `salesperson`, `storeCode`, `payment.bankAccount`, `revenue.promoPoints`.)
- `packages/shared-interfaces/src/invoice-report/search.ts` — thêm `customerId?`, `cashierId?`, `salespersonId?` (optional) vào `InvoiceReportFilterPayload`.

## Acceptance Criteria

- [ ] `REPORT_TYPE_LABELS_VI['invoice-item-revenue-detail']` trả đúng nhãn VI.
- [ ] Mọi key cột mới của report có nhãn VI trong `INVOICE_REPORT_COLUMN_LABELS_VI`.
- [ ] `InvoiceReportFilterPayload` mang thêm 3 trường optional, không phá vỡ 2 report type cũ.
- [ ] Build lại `@erp/shared-interfaces` thành công.

## Definition of Done

- [ ] `pnpm --filter @erp/shared-interfaces build` xanh.
- [ ] Không xóa/đổi nghĩa key cũ (thuần additive).

## Dependencies

- Blocks: TKT-IRD-02, TKT-IRD-03
