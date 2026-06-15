# TKT-RBI-04 BE: module wiring + report-type seed + openapi

## Epic

[EPIC-15062026 Doanh thu theo mặt hàng](../epics/EPIC-15062026-revenue-by-item-report.md)

## Summary

Đăng ký `RevenueByItemReport` vào module + `ReportRegistry` factory, seed report-type `revenue-by-item` (`sortOrder 40`), và regen OpenAPI (DTO filter đổi → có diff). Không thêm repo `forFeature` (đã có `ItemEntity`/`ItemCategoryEntity`).

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/invoice-report.module.ts` — thêm `RevenueByItemReport` vào `providers`, `inject`, và `ReportRegistry` factory args (`new ReportRegistry([daily, listing, itemRevenue, revenueByItem])`).
- `apps/api/src/modules/reporting/invoice-report/report-types.seed.ts` — thêm `{ key: 'revenue-by-item', sortOrder: 40 }` vào `REPORT_TYPE_DEFINITIONS`.
- `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` regen (do `InvoiceReportFilterDto` thêm `groupBy/categoryId/brand`).

## Acceptance Criteria

- [ ] App boot xanh; `ReportTypeSyncService` seed `report_types` có dòng `revenue-by-item` (`is_active=true`, sortOrder 40); `GET types` trả nó với nhãn VI.
- [ ] `GET columns?reportType=revenue-by-item` trả catalog của registry RBI-02.
- [ ] `ReportRegistry.get('revenue-by-item')` ≠ undefined; `list()` gồm 4 key.
- [ ] OpenAPI phản ánh field filter mới; `schema.ts` regen (không sửa tay).

## Definition of Done

- [ ] API chạy được (`make dev-api`), `pnpm openapi:generate` chạy, snapshot + `schema.ts` committed.
- [ ] `pnpm --filter @erp/api test` + `lint` xanh. Không Vietnamese trong source.

## Tech Approach

```ts
// invoice-report.module.ts (factory)
{
  provide: ReportRegistry,
  useFactory: (daily, listing, itemRevenue, revenueByItem) =>
    new ReportRegistry([daily, listing, itemRevenue, revenueByItem]),
  inject: [DailySalesSummaryReport, InvoiceOrderListingReport,
           InvoiceItemRevenueDetailReport, RevenueByItemReport],
}
// + RevenueByItemReport trong providers[]
```

```ts
// report-types.seed.ts
const REPORT_TYPE_DEFINITIONS = [
  { key: 'daily-sales-summary', sortOrder: 10 },
  { key: 'invoice-order-listing', sortOrder: 20 },
  { key: 'invoice-item-revenue-detail', sortOrder: 30 },
  { key: 'revenue-by-item', sortOrder: 40 },
];
```

## Testing Strategy

- Smoke: boot app, `GET types`/`columns` cho key mới (gộp vào E2E RBI-05).

## Dependencies

- Depends on: TKT-RBI-03
- Blocks: TKT-RBI-05
