# TKT-CSR-04 Enrich columns API (table config)

## Epic

[EPIC-24062026 Chain-Store Report API](../epics/EPIC-24062026-chain-store-report-api.md)

## Summary

Make `GET /reports/invoices/columns` return the full FE `ReportTableConfig`: `summaryLabel` +
columns enriched with `dataType`, `filterKind`, `filterOptions` (for `select` columns like `status`),
and display attrs (`align`, `pinned`, `link`). Backend becomes the source of truth for column filter
metadata (decision: "Backend owns it").

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/*.columns.ts` (the 4 column builders:
  `invoice-report.columns.ts`, `invoice-listing.columns.ts`, `invoice-item-revenue.columns.ts`,
  `revenue-by-item.columns.ts`) — each emitted `ReportColumnHeader` now also sets:
  - `filterKind`: derive from semantics — number/currency/percent → `'number'`, `date` → `'date'`,
    `time` (the `time` column) → `'time'`, `status` → `'select'`, else `'text'`. Ungroupable display-only
    columns may be `'none'`.
  - `filterOptions`: only for `status` (filterKind `select`) — the `invoiceStatus` enum table from
    shared-interfaces.
  - `align`: number-family → `'right'`, else `'left'`.
  - `link`: `true` for `invoiceCode` (and `productName`/`itemName` where doc marks link), else omit.
  - `pinned`: leading id columns (`date`, `sku`, `invoiceCode`) → `'left'` per doc where applicable.
- `apps/api/src/modules/reporting/invoice-report/queries/get-invoice-report-columns.handler.ts` —
  return `{ summaryLabel: 'Tổng', columns }` (was `{ headers }`).
- `apps/api/src/modules/reporting/invoice-report/invoice-report.controller.ts` — `@Get('columns')`
  response type updated to `InvoiceReportColumnsResult` (new shape). Re-enable
  `@RequirePermission('reporting.invoice.branch.read')`.

## Acceptance Criteria

- [ ] Response is `{ summaryLabel: 'Tổng', columns: ReportColumnHeader[] }`.
- [ ] `status` column has `filterKind:'select'` + `filterOptions` = §C.1 invoiceStatus list.
- [ ] Number-family columns have `filterKind:'number'`, `align:'right'`; `date` col `filterKind:'date'`;
      `time` col `filterKind:'time'`.
- [ ] `invoiceCode` has `link:true`.
- [ ] Existing dynamic `payment.method.<coaAccountId>` columns still emitted, now with
      `filterKind:'number'`, `align:'right'`.
- [ ] Each of the 4 reports' `buildColumns` covers exactly the doc's field set (no missing/extra keys).

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- columns` green (update the existing `*.columns.spec.ts`).
- [ ] `pnpm --filter @erp/api lint` passes.
- [ ] No Vietnamese added outside shared-interfaces label tables.

## Tech Approach

```ts
function filterKindFor(type: ReportColumnDataType, col: string): ReportColumnFilterKind {
  if (col === 'status') return 'select';
  if (col === 'time') return 'time';
  if (type === ReportColumnDataType.DATE || type === ReportColumnDataType.DATETIME) return 'date';
  if ([NUMBER, CURRENCY, PERCENT].includes(type)) return 'number';
  return 'text';
}
// status column:
{ col: 'status', name: 'Trạng thái', type: ENUM, filterKind: 'select',
  filterOptions: INVOICE_STATUS_OPTIONS /* from shared-interfaces */ }
```

## Testing Strategy

- Update `invoice-report.columns.spec.ts`, `invoice-listing.columns.spec.ts`,
  `invoice-item-revenue.columns.spec.ts` to assert the new `filterKind`/`filterOptions`/`align`/`link`
  and the `{ summaryLabel, columns }` envelope.

## Dependencies

- Depends on: TKT-CSR-01.
- Blocks: TKT-CSR-07.
