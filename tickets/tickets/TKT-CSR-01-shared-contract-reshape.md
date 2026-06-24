# TKT-CSR-01 Shared contract reshape (types + enums)

## Epic

[EPIC-24062026 Chain-Store Report API](../epics/EPIC-24062026-chain-store-report-api.md)

## Summary

Foundation ticket. Reshape `@erp/shared-interfaces/src/invoice-report/*` to the FE 3-API contract so
every downstream ticket (DTOs, handlers, FE) consumes one source of truth. Pure type + enum + const
changes — no runtime logic, no migration.

## Deliverables

- `packages/shared-interfaces/src/invoice-report/column.ts`
  - Enrich `ReportColumnHeader` to match FE `ReportColumnConfig`:
    add `filterKind: ReportColumnFilterKind`, `filterOptions?: ReportFilterOption[]`,
    `align?: 'left'|'right'|'center'`, `pinned?: 'left'|'right' | null`, `link?: boolean`,
    `width?: number`. Keep `col/name/desc/type/group`.
  - Add `ReportColumnFilterKind = 'text'|'number'|'date'|'time'|'select'|'none'`.
  - Reshape `InvoiceReportColumnsResult` → `{ summaryLabel: string; columns: ReportColumnHeader[] }`
    (was `{ headers }`). `summaryLabel` default `"Tổng"`.
- `packages/shared-interfaces/src/invoice-report/search.ts`
  - **Reconcile `ReportGroupBy`** to FE `statBy`: `ITEM='item' | PARENT='parent' | GROUP='group'`
    (was `item|group|brand`; brand grouping moves to `statisticByBrand`).
  - Extend `InvoiceReportFilterPayload`:
    `store?: { scope: 'all'|'group'; storeIds: string[] }`,
    `invoiceStatus?: string[]` (multi), `statDateType?: 'invoice_date'|'created_date'`,
    `productType?: 'product'|'service'|'combo'`, `statBy?: ReportGroupBy`,
    `statisticByBrand?: boolean`, `allocateComboRevenue?: boolean`.
    Keep existing `issuedAt/status/type/branchId/customerId/cashierId/salespersonId/categoryId/brand`
    (status kept for back-compat; invoiceStatus[] is the new multi form).
  - Extend `ColumnFilter` with text operators: `contains?`, `equals?`, `startsWith?`, `endsWith?`,
    `notContains?` (string). Keep `eq/lt/lte/gt/gte/from/to`.
  - **Reshape result to keyed rows** (consumed by CSR-06):
    `ReportRow = Record<string, ReportCellValue>`;
    `InvoiceReportResult = { rows: ReportRow[]; totals: ReportRow | null; total: number }`
    (drop `dataRaw`/`page`/`limit` cell-array form).
- `packages/shared-interfaces/src/invoice-report/options.ts` (new)
  - `IDropdownOption = { value: string|number; label: string; metadata?: Record<string, unknown> }`.
  - `ReportFilterOptionType` enum (the dropdown `type` param): `store, cashier, salesperson, customer,
    productGroup, brand, unit, invoiceStatus, statDateType, productType, statBy`.
  - `ReportFilterOption = { value: string; label: string }` (for column `filterOptions`).
  - Static enum option tables (value+VI label) for `invoiceStatus, statDateType, productType, statBy`
    per Phụ lục §C.1–C.4 — backend serves these so FE drops its mock copies.
- `packages/shared-interfaces/src/invoice-report/index.ts` — export the new module.

## Acceptance Criteria

- [ ] `pnpm --filter @erp/shared-interfaces build` passes; `@erp/api` and api-client typecheck against
      new shapes (downstream tickets fix call sites — this ticket may leave intentional type errors in
      `@erp/api` that CSR-04/05/06 resolve; note them, do not patch logic here).
- [ ] No Vietnamese in type/enum identifiers; VI only inside the label const tables (mirrors the
      existing `INVOICE_REPORT_COLUMN_LABELS_VI` pattern).
- [ ] `ReportGroupBy` no longer contains `brand`; a repo-wide grep shows no remaining `ReportGroupBy.BRAND`.

## Definition of Done

- [ ] `pnpm --filter @erp/shared-interfaces build` green.
- [ ] Diff limited to `packages/shared-interfaces/src/invoice-report/*`.
- [ ] No TODO/FIXME outside the plan.

## Tech Approach

```ts
// column.ts
export type ReportColumnFilterKind = 'text' | 'number' | 'date' | 'time' | 'select' | 'none';
export interface ReportFilterOption { value: string; label: string; }
export interface ReportColumnHeader {
  col: string; name: string | null; desc: string | null;
  type: ReportColumnDataType; group: ReportColumnGroup | null;
  filterKind: ReportColumnFilterKind;
  filterOptions?: ReportFilterOption[];   // only for filterKind === 'select'
  align?: 'left' | 'right' | 'center';
  pinned?: 'left' | 'right' | null;
  link?: boolean;
  width?: number;
}
export interface InvoiceReportColumnsResult { summaryLabel: string; columns: ReportColumnHeader[]; }

// search.ts
export type ReportRow = Record<string, ReportCellValue>;
export interface InvoiceReportResult { rows: ReportRow[]; totals: ReportRow | null; total: number; }
```

## Testing Strategy

- Type-level only; covered transitively by downstream unit specs. No new spec file here.

## Dependencies

- Depends on: —
- Blocks: TKT-CSR-02, TKT-CSR-04, TKT-CSR-06.
