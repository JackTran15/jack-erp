# TKT-CSR-06 Keyed-row response + text column operators

## Epic

[EPIC-24062026 Chain-Store Report API](../epics/EPIC-24062026-chain-store-report-api.md)

## Summary

Switch the search response from cell-arrays (`dataRaw: ReportCell[][]`) to **keyed rows**
(`rows: Record<field, value>[]`, `totals: Record<field, value>`) per the FE doc, and add the text
column-filter operators (`contains/equals/startsWith/endsWith/notContains`) alongside the existing
number/date ops. Touches the same aggregator files as CSR-05, so lands after it.

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/invoice-report.aggregator.ts` (+ the 3 other
  aggregators) — emit each row as `Record<col, ReportCellValue>` keyed by column `field`; build
  `totals` the same way (number columns summed, text/date null/empty). Drop the per-cell
  `{col,type,value}` envelope on the wire.
- `apps/api/src/modules/reporting/invoice-report/invoice-report.aggregator.ts` `matchColumnFilter` —
  extend to text operators on string cells: `contains` (substring), `equals`, `startsWith`,
  `endsWith`, `notContains`; keep numeric `eq/lt/lte/gt/gte` and date `from/to`. Operators on a cell
  AND together. Empty value = ignore (per doc).
- `apps/api/src/modules/reporting/invoice-report/queries/search-invoice-report.handler.ts` — return
  `{ rows, totals, total }` (drop `page`/`limit` from the envelope; pagination still applied to slice
  rows, `total` = count before slice).
- Update `reports/*.report.ts` `buildData` return assembly to the keyed-row builder.

## Acceptance Criteria

- [ ] Response is `{ rows: Record<field,value>[], totals: Record<field,value>|null, total: number }`.
- [ ] Row keys == the column `field`s from `GET /columns` for that report (1:1, no stray keys).
- [ ] Empty number cell = `0`; empty text/date cell = `''`/null per doc §B.
- [ ] `totals` present only for number columns; null when no rows.
- [ ] `columnFilters` text ops work: `{col:'invoiceCode', contains:'HD'}` filters substring;
      `notContains` excludes; number `{col:'revenueTotal', gte:1000}` still works.
- [ ] `total` reflects count **before** pagination slice.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- aggregator` green (rewrite the cell-array assertions to keyed-row).
- [ ] `pnpm --filter @erp/api lint` passes.
- [ ] No remaining references to `dataRaw` / `ReportCell[]` wire shape in the module.

## Tech Approach

```ts
type Row = Record<string, ReportCellValue>;
function toRow(cols: string[], get: (col: string) => ReportCellValue): Row {
  return Object.fromEntries(cols.map((c) => [c, get(c)]));
}
function matchColumnFilter(row: Row, f: ColumnFilter): boolean {
  const v = row[f.col];
  if (typeof v === 'string') {
    if (f.contains != null && !v.toLowerCase().includes(f.contains.toLowerCase())) return false;
    if (f.equals != null && v !== f.equals) return false;
    if (f.startsWith != null && !v.startsWith(f.startsWith)) return false;
    if (f.endsWith != null && !v.endsWith(f.endsWith)) return false;
    if (f.notContains != null && v.toLowerCase().includes(f.notContains.toLowerCase())) return false;
  }
  if (typeof v === 'number') {
    if (f.eq != null && v !== f.eq) return false;
    if (f.lt != null && !(v < f.lt)) return false;
    /* lte/gt/gte … */
  }
  return true;
}
```

## Testing Strategy

- Unit: keyed-row shape assertions; each text operator; number ops; `total` vs sliced `rows.length`;
  totals only-number-columns.

## Dependencies

- Depends on: TKT-CSR-01, TKT-CSR-05.
- Blocks: TKT-CSR-07.
