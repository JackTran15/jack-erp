# TKT-IOL-04 BE: Wiring registry/seed/forFeature + openapi:generate

## Epic

[EPIC-14062026 Bảng kê hóa đơn và đơn hàng](../epics/EPIC-14062026-invoice-order-listing-report.md)

## Summary

Đăng ký `InvoiceOrderListingReport` vào DI + `ReportRegistry`, thêm key vào catalogue seed, cấp repo còn thiếu cho `forFeature`, và chạy `openapi:generate`. Sau ticket này, `GET /reports/invoices/types` liệt kê 2 type và report mới chạy được end-to-end qua endpoint sẵn có.

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/invoice-report.module.ts`:
  - `providers`: thêm `InvoiceOrderListingReport`.
  - Factory `ReportRegistry`: `useFactory: (daily, listing) => new ReportRegistry([daily, listing])`, `inject: [DailySalesSummaryReport, InvoiceOrderListingReport]`.
  - `TypeOrmModule.forFeature([...])`: thêm `CustomerEntity`, `BranchEntity`, `EmployeeProfileEntity` (giữ `InvoiceEntity`, `InvoicePaymentEntity`, `InvoicePromotionEntity`, `PaymentAccountEntity`, template/report-type entity).
- `apps/api/src/modules/reporting/invoice-report/report-types.seed.ts`:
  - `REPORT_TYPE_DEFINITIONS`: thêm `{ key: 'invoice-order-listing', sortOrder: 20 }` (name lấy từ `REPORT_TYPE_LABELS_VI` đã thêm ở TKT-IOL-01). `ReportTypeSyncService` tự upsert vào `report_types` khi boot.
- Chạy `pnpm openapi:generate` (API phải đang chạy): kỳ vọng **không** diff (endpoint/DTO không đổi; report-type là dữ liệu seed runtime, không nằm trong OpenAPI schema). Chỉ commit `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` **nếu** có diff thật.

## Acceptance Criteria

- [ ] App boot không lỗi; `ReportRegistry.list()` chứa cả `daily-sales-summary` + `invoice-order-listing`.
- [ ] `ReportTypeSyncService` upsert seed → `GET /reports/invoices/types` trả 2 type (label VI đúng).
- [ ] `GET /reports/invoices/columns?reportType=invoice-order-listing` 200 (không 500 do thiếu definition); key seed luôn có definition tương ứng (tránh bẫy "seeded key without code definition" mô tả trong `report-types.seed.ts`).
- [ ] Repo mới resolve được trong `InvoiceOrderListingReport` (không lỗi DI "Nest can't resolve dependencies").
- [ ] `openapi:generate` đã chạy; nếu không diff → ghi rõ trong PR; nếu có diff → commit snapshot + schema (không hand-edit generated).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` xanh; app `make dev-api` boot OK (sync log report-type).
- [ ] Không sửa shape endpoint/DTO; `daily-sales-summary` vẫn hoạt động.
- [ ] Không tiếng Việt trong source backend.

## Tech Approach

```ts
// invoice-report.module.ts (trích)
TypeOrmModule.forFeature([
  InvoiceReportTemplateEntity, ReportTypeEntity,
  InvoiceEntity, InvoicePaymentEntity, InvoicePromotionEntity, PaymentAccountEntity,
  CustomerEntity, BranchEntity, EmployeeProfileEntity,        // + repo cho report mới
]),
providers: [
  DailySalesSummaryReport,
  InvoiceOrderListingReport,                                  // +
  {
    provide: ReportRegistry,
    useFactory: (daily: DailySalesSummaryReport, listing: InvoiceOrderListingReport) =>
      new ReportRegistry([daily, listing]),                  // +
    inject: [DailySalesSummaryReport, InvoiceOrderListingReport],
  },
  ReportTypeSyncService,
  // ...handlers giữ nguyên (search/columns/types dispatch generic — không thêm handler)...
],
```

```ts
// report-types.seed.ts (trích)
const REPORT_TYPE_DEFINITIONS: ReportTypeDefinition[] = [
  { key: 'daily-sales-summary', sortOrder: 10 },
  { key: 'invoice-order-listing', sortOrder: 20 },           // +
];
```

## Testing Strategy

- Smoke: boot app, `GET /reports/invoices/types` (e2e ở TKT-IOL-05 cover chính thức).
- `list-invoice-report-types.handler.spec.ts` hiện có: cập nhật/đảm bảo vẫn đúng khi có 2 type.

## Dependencies

- Depends on: TKT-IOL-03
- Blocks: TKT-IOL-05
