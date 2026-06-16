# TKT-IRD-04 BE: Wiring registry/seed/forFeature + openapi:generate

## Epic

[EPIC-14062026 Chi tiết doanh thu theo hóa đơn và mặt hàng](../epics/EPIC-14062026-invoice-item-revenue-detail-report.md)

## Summary

Đăng ký report mới vào module + seed catalogue report type, đăng ký các repo entity còn thiếu, và regen OpenAPI client (kỳ vọng **có** diff do 3 filter mới).

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/invoice-report.module.ts`:
  - import + thêm `InvoiceItemRevenueDetailReport` vào `providers` và factory `ReportRegistry` (`inject` thêm).
  - thêm vào `TypeOrmModule.forFeature`: `InvoiceItemEntity`, `CustomerGroupEntity`, `UserEntity`, `ItemEntity`, `ItemCategoryEntity`, `LocationEntity`, `ItemProviderEntity`, `ProviderEntity`.
- `apps/api/src/modules/reporting/invoice-report/report-types.seed.ts` — thêm `{ key: 'invoice-item-revenue-detail', sortOrder: 30 }` vào `REPORT_TYPE_DEFINITIONS`.
- Regen: `packages/api-client/openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts`.

## Acceptance Criteria

- [ ] App boot: `ReportTypeSyncService` seed report type mới (log `1 inserted`); `GET /reports/invoices/types` liệt kê 3 type.
- [ ] `ReportRegistry.get('invoice-item-revenue-detail')` trả định nghĩa mới; handler search/columns dispatch generic (không handler mới).
- [ ] `pnpm --filter @erp/api build` xanh (DI resolve mọi repo mới).
- [ ] Chạy API trên :4000 → `pnpm openapi:generate`; **có** diff (3 filter `customerId`/`cashierId`/`salespersonId` optional) → commit cả snapshot + `schema.ts`. Không hand-edit file generated.

## Definition of Done

- [ ] Diff OpenAPI chỉ là additive (3 filter optional), không churn ngoài dự kiến.
- [ ] `pnpm --filter @erp/api test -- invoice-report` xanh.

## Dependencies

- Depends on: TKT-IRD-03
- Blocks: TKT-IRD-05
