# TKT-PRF-01 Backend module scaffold + report-query.util relocation

## Epic

[EPIC-16072026 Báo cáo lợi nhuận (Profit Reports)](../epics/EPIC-16072026-profit-reports.md)

## Summary

Tạo module `apps/api/src/modules/reporting/profit-report/` theo đúng cấu trúc
`debt-report/` (dùng chung `reporting/report-core/`). Trước khi viết report thật, di
chuyển `invoice-report/report-query.util.ts` → `report-core/report-query.util.ts` để cả
`invoice-report/` và `profit-report/` dùng chung branch-scoping logic (đã chốt với product
owner trong phiên plan — không duplicate). Ticket nền tảng, không có report definition thật
(3 report thật nằm ở TKT-PRF-02..04).

## Deliverables

- **Relocate** `apps/api/src/modules/reporting/invoice-report/report-query.util.ts` →
  `apps/api/src/modules/reporting/report-core/report-query.util.ts`. Nội dung giữ nguyên
  100% (`applyBranchScope`, `applyInvoiceStatusFilter`, `resolveBranchIds`,
  `CONSOLIDATED_PERMISSION`, `invoiceTypeSign`, `signedGoods`, `statDateColumn`). Cập nhật
  toàn bộ import trong `invoice-report/reports/*.report.ts` (và bất kỳ file nào khác import
  từ đường dẫn cũ) trỏ sang `../report-core/report-query.util`.
- `apps/api/src/modules/reporting/profit-report/profit-report.module.ts` — đăng ký ở
  `app.module.ts`, import `CqrsModule` (theo pattern `invoice-report.module.ts`).
- `apps/api/src/modules/reporting/profit-report/profit-report.controller.ts` — route chung:
  `GET /reports/profit/columns` (nhận thêm query `statBy` cho báo cáo #1),
  `POST /reports/profit/search`, `GET /reports/profit/filter-options`,
  `GET/POST/PATCH/DELETE /reports/profit/templates[/:id]` — dispatch theo `reportType` qua
  `ProfitReportRegistry` (mirror `DebtReportRegistry`/`InvoiceReportRegistry`).
- `apps/api/src/modules/reporting/profit-report/report-definition.ts` —
  `ProfitReportRegistry` implement `ReportRegistry<TDef>` từ `report-core/`.
- `apps/api/src/modules/reporting/profit-report/dto/` — `ProfitReportSearchDto`,
  `ProfitReportFilterDto` (base: `issuedAt` date range, `branchId?`), `ColumnFilterDto`,
  `ReportFilterOptionsQueryDto`, `ReportTemplateColumnDto`,
  `Create/UpdateProfitReportTemplateDto` — copy khung từ `debt-report/dto/`.
- `apps/api/src/modules/rbac/permissions.seed.ts` — thêm permission
  `reporting.profit.read` (theo mẫu `reporting.debts.read`).

## Acceptance Criteria

- [ ] Sau khi relocate, `pnpm --filter @erp/api build` + `pnpm --filter @erp/api test`
      pass — không có import path nào còn trỏ tới file cũ đã xoá.
- [ ] `ProfitReportController` áp `@UseGuards(AuthGuard, PermissionGuard)` +
      `@RequirePermission("reporting.profit.read")`.
- [ ] Controller/registry compile được dù chưa có report definition thật (stub tạm nếu
      cần) — TKT-PRF-02..04 chỉ cần "cắm" định nghĩa mới vào registry, không sửa
      controller.
- [ ] Permission `reporting.profit.read` xuất hiện trong seed, gán được cho role admin qua
      `pnpm seed:sync-admin-permissions`.

## Definition of Done

- [ ] PR passes `pnpm --filter @erp/api test` và `pnpm --filter @erp/api lint`.
- [ ] Không có schema change (không migration).
- [ ] Không tiếng Việt trong code/comment/log backend.
- [ ] Diff của bước relocate là thuần "di chuyển file + đổi import path" — reviewer dễ xác
      nhận không có thay đổi logic trong `report-query.util.ts`.

## Tech Approach

```ts
// report-core/report-query.util.ts — nội dung y hệt invoice-report/report-query.util.ts cũ
export function applyBranchScope(qb, alias, branchIds) { /* ... */ }
export function resolveBranchIds(hasConsolidated, storeFilter, branchId, actor) { /* ... */ }
export const CONSOLIDATED_PERMISSION = /* ... */;
export function invoiceTypeSign(type) { /* ... */ }
export function signedGoods(invoice) { /* ... */ }
export function applyInvoiceStatusFilter(qb, alias, filters) { /* ... */ }
export function statDateColumn(alias, filters) { /* ... */ }
```

`profit-report.controller.ts` mirror `debt-report.controller.ts`, chỉ khác base path
(`/reports/profit`) và query param bổ sung `statBy` trên route `columns` (dùng ở TKT-PRF-02).

## Testing Strategy

- Không cần unit test riêng cho bước relocate (test hiện có của `invoice-report/*` đã cover
  hành vi các hàm này — nếu import path sai, test suite fail ngay).
- Test compile/lint là gate chính cho ticket này.

## Dependencies

- Depends on: không có.
- Blocks: TKT-PRF-02, TKT-PRF-03, TKT-PRF-04.
