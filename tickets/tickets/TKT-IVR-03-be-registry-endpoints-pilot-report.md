# TKT-IVR-03 BE: InventoryReportRegistry + v2 endpoints (columns/search/filter-options) + pilot report #1

## Epic

[EPIC-06072026 Báo cáo kho hàng theo structure báo cáo bán hàng](../epics/EPIC-06072026-inventory-report-v2.md)

## Summary

Dựng khung contract mới trong module `inventory-reports`: registry riêng cho báo cáo kho, DTOs, controller v2 với 3 endpoint (columns/search/filter-options), scope/cache utils, và report định nghĩa đầu tiên end-to-end — **#1 Tổng hợp nhập xuất tồn kho** (pilot chứng minh pattern, gồm cả supplier enrichment).

## Deliverables

- `apps/api/src/modules/inventory-reports/report/inventory-report-definition.ts` — `type InventoryReportDefinition = ReportDefinition<InventoryReportSearchDto>`; `class InventoryReportRegistry extends ReportRegistry<InventoryReportDefinition> {}` (DI class token, factory provider trong module như `invoice-report.module.ts`).
- `apps/api/src/modules/inventory-reports/dto/inventory-report-search.dto.ts` — `InventoryReportSearchDto { reportType, columns[], filters: InventoryReportFilterDto, columnFilters?: ColumnFilterDto[] (REUSE class invoice), page?=1, limit?=20 (Max 500) }`; `InventoryReportFilterDto` backing `InventoryReportFilterPayload` (class-validator + `@ApiProperty` đủ mọi field — global whitelist).
- `apps/api/src/modules/inventory-reports/dto/inventory-filter-options-query.dto.ts` — `{ type, search?, page?, pageSize? }`.
- `apps/api/src/modules/inventory-reports/inventory-report-v2.controller.ts` — `@Controller('reports/inventory')`, `@UseGuards(AuthGuard, PermissionGuard)` class-level, `@RequirePermission('inventory.reports.read')`:
  - `GET columns?reportType=` → QueryBus `GetInventoryReportColumnsQuery` → `{ summaryLabel: 'Tổng', columns }` (404/400 khi reportType lạ).
  - `POST search` → `SearchInventoryReportQuery` → `{ rows, totals, total }`.
  - `GET filter-options` → `GetInventoryFilterOptionsQuery` → `IDropdownOption[]`.
- `apps/api/src/modules/inventory-reports/queries/` — 3 query + 3 handler (CQRS). Filter-options handler: types `store` (branches org-scoped), `productGroup` (item categories), `brand` (distinct items.brand), `unit` (distinct items.unit), `statBy` (static), `productType` (static), **`warehouse` (storages org-scoped)** — tái dùng logic từ handler invoice (`get-report-filter-options.handler.ts`), search ILIKE + phân trang.
- `apps/api/src/modules/inventory-reports/report/report-scope.util.ts` — `resolveInventoryBranchIds(store, actor)` (`'all'`/absent → undefined = org-wide, `'group'` → storeIds validate thuộc org); `resolveWarehouseLocationIds(warehouseIds, orgId)` (storages → locations).
- `apps/api/src/modules/inventory-reports/report/reports/stock-summary.report.ts` — report #1 (backendKey `inventory-stock-summary`):
  - `buildColumns`: fixed catalog theo key FE (name, parentSku, parentName, color, size, unit, group, brand, sku, positionCode, positionName + bands opening/in/out/ending/transferOut/incoming + supplier), VI labels/bands từ shared-interfaces, metadata qua `report-column.util` (align phải cho number, pinned trái cột định danh, filterKind).
  - `buildData`: `date-range-resolver` → `resolveInventoryBranchIds` + `resolveWarehouseLocationIds` → `StockPeriodService.aggregate({ groupBy:'item_location', itemGroupBy: filters.statBy, branchIds, locationIds, categoryIds:[categoryId], search, hideZeroRows: filters.hideZeroRows ?? true, page:1, pageSize: MAX_REPORT_ROWS })` → map keyed rows (**đắp brand/color/size/transferOut/incoming từ StockPeriodRow** — engine đã trả, adapter FE cũ vứt đi) → supplier enrichment batch (item ids → `item_providers` primary → provider name) → in-memory filter unit/brand → `matchColumnFilter` → totals toàn bộ rows (null cho cột string) → paginate slice.
  - Bọc `CacheService.getOrSet('inventory-reports', sha256(orgId + normalized dto), fn, 45)`.
- `apps/api/src/modules/inventory-reports/inventory-reports.module.ts` (edit) — thêm CqrsModule, controller v2, providers, registry factory, `forFeature` repos cần thêm (ItemProviderEntity, ProviderEntity, StorageEntity, BranchEntity...). Legacy controller/service GIỮ NGUYÊN.

## Acceptance Criteria

- [ ] Mọi query filter theo `actor.organizationId`; `store.scope='group'` validate storeIds thuộc org (400 nếu lạ); không cross-tenant leakage.
- [ ] `GET columns?reportType=inventory-stock-summary` trả đúng catalog (key + VI label + band + type + filterKind); reportType lạ → 400.
- [ ] `POST search`: rows keyed đúng key FE; `totals` tính trên toàn bộ rows sau filter (không phải trang); columnFilters number (eq/lt/lte/gt/gte) + text (contains/equals/startsWith/endsWith/notContains) hoạt động qua `matchColumnFilter`; phân trang đúng `total`.
- [ ] brand/color/size/transferOutQty/transferOutValue/incomingQty/incomingValue có giá trị thật từ engine; supplier = tên provider primary (null nếu không có).
- [ ] Cache 45s: cùng dto → 1 lần engine query; đổi filter → key khác.
- [ ] Legacy `GET /reports/inventory/*` không đổi (không sửa engine SQL).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + lint xanh.
- [ ] Spec: registry wiring, scope util, stock-summary.report (buildColumns catalog + buildData mapping/filters/totals/pagination với engine mock), filter-options handler (warehouse type + org scope).
- [ ] Không schema change; `synchronize` false.
- [ ] Không Vietnamese trong backend source (labels import từ shared-interfaces).
- [ ] Không TODO/FIXME.

## Tech Approach

Mirror `invoice-report.controller.ts` + `daily-sales-summary.report.ts`. `MAX_REPORT_ROWS = 50_000` (constant, throw 400 với message rõ khi engine trả >= cap để user thu hẹp kỳ). Supplier enrichment: 1 query `IN(itemIds)` với `is_primary = true`, map về row — không đụng SQL engine.

## Testing Strategy

- Unit với engine service mock: mapping từng cột, null policy, unit/brand in-memory filter, columnFilters, totals-toàn-bộ vs page slice, cap behavior.
- Handler filter-options: seed 2 org → chỉ trả org của actor.

## Dependencies

- Depends on: TKT-IVR-01, TKT-IVR-02
- Blocks: TKT-IVR-04, TKT-IVR-05, TKT-IVR-06
