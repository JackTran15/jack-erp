# TKT-CSR-08 FE integration (real options + filters + mapper)

## Epic

[EPIC-24062026 Chain-Store Report API](../epics/EPIC-24062026-chain-store-report-api.md)

## Summary

Point the backoffice Chuỗi cửa hàng reports at the real backend for all three concerns: consume the
enriched `columns` config, the keyed-row `search` response, and the new `filter-options` endpoint.
Remove mock dropdowns and dead mock fetchers. FE-only ticket.

## Deliverables

- `apps/backoffice-web/src/pages/chain-store/reports/_api/invoice-report.api.ts`
  - `mapHeadersToTableConfig` → consume `{ summaryLabel, columns }` directly; carry through
    `filterKind`/`filterOptions`/`align`/`pinned`/`link` from BE (stop deriving from registry).
  - `fetchReportData` → consume keyed `{ rows, totals, total }` (drop the cell-array→object mapper).
  - `buildSearchFilters` → send the **full** per-report filter set: `store` scope `{scope,storeIds}`,
    `invoiceStatus[]`, `statDateType`, `statBy`, `productType`, `categoryId`, `brand`,
    `statisticByBrand`, `allocateComboRevenue` (currently only date+status+cashier/sales/customer sent).
  - `buildColumnFilters` → send text operators (`contains/equals/startsWith/endsWith/notContains`) and
    number/date ops, not equality-only.
- `apps/backoffice-web/src/pages/chain-store/reports/_api/report-filter-options.api.ts` (new) +
  `useReportFilterOptions(type, search)` TanStack hook → `GET /reports/invoices/filter-options`.
  queryKey `["report-filter-options", type, search]`.
- `apps/backoffice-web/src/pages/chain-store/reports/ReportPageHeader/.../ReportFilterLine.tsx` and the
  `ReportSelectField`/`StoreScopeField`/`InvoiceStatusMultiSelect` controls — source options from
  `useReportFilterOptions(<type>)` instead of the mock arrays.
- Delete mocks once unreferenced: `_mock/report-invoice-filter.mock.ts`,
  `_mock/report-inventory-filter.mock.ts` (only the parts the sales reports used),
  `ReportSelector/_mock/report-stores.mock.ts`, and the dead
  `_mock/report-daily-sales.{mock,fetcher}.ts`.
- `apps/backoffice-web/src/constants/reports/report.interface.ts` — align `ReportColumnConfig`/
  `IDropdownOption` with the generated/shared types where they now overlap.

## Acceptance Criteria

- [ ] All 4 sales reports: table config, rows, and every filter dropdown come from real API (no mock).
- [ ] Store scope multi-select drives consolidation (selecting 2 stores changes the data).
- [ ] `status` column filter dropdown populated from BE `filterOptions`.
- [ ] Column filters apply the chosen operator (contains/startsWith/number compare), not just equality.
- [ ] No dangling imports to deleted mock files; `pnpm --filter @erp/backoffice-web build` passes.

## Definition of Done

- [ ] FE typechecks against regenerated api-client (CSR-07).
- [ ] Vietnamese UI strings preserved; no English leaking into user-facing labels.
- [ ] Dead `_mock/report-daily-sales.*` removed.
- [ ] Manual smoke: open each of the 4 reports in Chuỗi cửa hàng, verify data + dropdowns load.

## Tech Approach

```ts
export function useReportFilterOptions(type: ReportFilterOptionType, search?: string) {
  return useQuery({
    queryKey: ["report-filter-options", type, search],
    queryFn: () => requireErpData(erpApi.GET("/reports/invoices/filter-options",
      { params: { query: { type, search } } })),
    enabled: !!type,
  });
}
```

## Testing Strategy

- Manual smoke per report (the web apps have no real test runner — `test`/`lint` are echo stubs).
- Verify network calls in devtools: `/columns`, `/search`, `/filter-options` all 200 with real data.

## Dependencies

- Depends on: TKT-CSR-07.
- Blocks: TKT-CSR-09.
