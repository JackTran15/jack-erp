# TKT-RBI-01 shared-interfaces: nhãn VI + cột mới + `ReportGroupBy` + filter additive

## Epic

[EPIC-15062026 Doanh thu theo mặt hàng](../epics/EPIC-15062026-revenue-by-item-report.md)

## Summary

Thêm contract (additive) cho report type #4: nhãn VI report-type `revenue-by-item`, nhãn cột mới (`brand`…), enum `ReportGroupBy`, và 3 field optional (`groupBy`/`categoryId`/`brand`) trên `InvoiceReportFilterPayload`. Pure types/consts — không runtime, không breaking.

## Deliverables

- `packages/shared-interfaces/src/invoice-report/report-type.ts` — thêm `'revenue-by-item': 'Doanh thu theo mặt hàng'` vào `REPORT_TYPE_LABELS_VI`.
- `packages/shared-interfaces/src/invoice-report/column.ts` — thêm nhãn cột còn thiếu vào `INVOICE_REPORT_COLUMN_LABELS_VI` (`brand: 'Thương hiệu'`; tái dùng `sku`/`itemName`/`itemCategory`/`unit`/`quantity`/`revenue.goods`/`revenue.discount`/`revenue.total`/`revenue.promoRate`/`revenue.promoPoints` đã có).
- `packages/shared-interfaces/src/invoice-report/search.ts` — thêm `export enum ReportGroupBy { ITEM='item', GROUP='group', BRAND='brand' }`; thêm `groupBy?`, `categoryId?`, `brand?` vào `InvoiceReportFilterPayload`.

## Acceptance Criteria

- [ ] `REPORT_TYPE_LABELS_VI['revenue-by-item']` = `'Doanh thu theo mặt hàng'`.
- [ ] `INVOICE_REPORT_COLUMN_LABELS_VI` có nhãn cho **mọi** key mà registry RBI-02 sẽ dùng (đặc biệt `brand`).
- [ ] `ReportGroupBy` export được từ `@erp/shared-interfaces`; `InvoiceReportFilterPayload` có `groupBy?/categoryId?/brand?` (optional, không phá consumer cũ).
- [ ] `pnpm --filter @erp/shared-interfaces build` xanh.

## Definition of Done

- [ ] Build shared-interfaces xanh; additive (không đổi field cũ).
- [ ] Không Vietnamese trong code/identifier (chỉ giá trị nhãn hiển thị là VI — đúng pattern `*_LABELS_VI`).

## Tech Approach

```ts
// search.ts (additive)
export enum ReportGroupBy {
  ITEM = 'item',
  GROUP = 'group',
  BRAND = 'brand',
}

export interface InvoiceReportFilterPayload {
  issuedAt: { from?: string; to?: string };
  status?: { value: string | null };
  type?: { value: string | null };
  branchId?: string;
  customerId?: string;
  cashierId?: string;
  salespersonId?: string;
  // revenue-by-item only (ignored by other reports):
  groupBy?: ReportGroupBy;
  categoryId?: string;
  brand?: string;
}
```

## Testing Strategy

- Type-only build.

## Dependencies

- Depends on: —
- Blocks: TKT-RBI-02, TKT-RBI-03
