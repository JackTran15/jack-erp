# TKT-IRB-06 BE: Permissions seed + openapi:generate

## Epic

[EPIC-11062026 Báo cáo tổng hợp bán hàng theo ngày](../epics/EPIC-11062026-invoice-report-builder.md)

## Summary

Seed 3 permission mới cho feature (theo convention `reporting.<x>.<scope>.read` + một quyền quản lý template) kèm nhãn VI, gắn `@RequirePermission` đúng từng route trên `InvoiceReportController`, rồi chạy `pnpm openapi:generate` và commit api-client snapshot để FE (TKT-07/08) dùng type sinh ra.

## Deliverables

- `apps/api/src/modules/rbac/permissions.seed.ts` — thêm vào `PERMISSION_DEFINITIONS`:
  - `{ key: 'reporting.invoice.branch.read', module: 'reporting' }`
  - `{ key: 'reporting.invoice.consolidated.read', module: 'reporting' }`
  - `{ key: 'reporting.invoice-template.manage', module: 'reporting' }`
- `packages/shared-interfaces` `PERMISSION_LABELS_VI` — nhãn VI cho 3 key trên (vd `'reporting.invoice.branch.read': 'Xem báo cáo hóa đơn (chi nhánh)'`, `'reporting.invoice.consolidated.read': 'Xem báo cáo hóa đơn (toàn chuỗi)'`, `'reporting.invoice-template.manage': 'Quản lý template báo cáo hóa đơn'`).
- `invoice-report.controller.ts` — xác nhận guard từng route:
  - `GET columns`, `POST search`, `GET templates`, `GET templates/:id` → `reporting.invoice.branch.read`
  - `POST/PATCH/DELETE templates` → `reporting.invoice-template.manage`
  - (Gate consolidated kiểm trong `SearchInvoiceReportHandler` qua `RbacService.hasPermission('reporting.invoice.consolidated.read')`, không phải `@RequirePermission`.)
- Chạy `pnpm openapi:generate` (API phải đang chạy :4000) → commit `apps/api/openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` (không sửa tay).

## Acceptance Criteria

- [ ] 3 permission xuất hiện sau seed; gán role admin/owner mặc định (theo cách seed hiện tại gán full).
- [ ] User thiếu `reporting.invoice.branch.read` → 403 ở mọi route đọc; thiếu `reporting.invoice-template.manage` → 403 khi tạo/sửa/xóa template.
- [ ] User có branch.read nhưng thiếu consolidated → search bỏ trống `branchId` chỉ trả branch của mình; có consolidated → toàn chuỗi (đúng TKT-04).
- [ ] OpenAPI snapshot phản ánh đủ 7 route mới (columns/search + 5 template) với DTO/response đúng; `schema.ts` regenerated.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh; seed chạy được (`pnpm seed:dev-admin` không lỗi permission mới).
- [ ] `openapi.snapshot.json` + `schema.ts` đã commit, không hand-edit; diff chỉ chứa route/DTO của feature này.
- [ ] Backend source tiếng Anh; nhãn VI chỉ ở shared `PERMISSION_LABELS_VI`.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

- Theo đúng pattern `permissions.seed.ts`: thêm entry `{ key, module }` vào `PERMISSION_DEFINITIONS`; mô tả tự resolve từ `PERMISSION_LABELS_VI` (shared). Không tạo enum/cấu trúc mới.
- Quy ước scope: `*.branch.read` = quyền nền (mọi user report có); `*.consolidated.read` = quyền nâng cao mở toàn chuỗi — **không** dùng làm `@RequirePermission` route (nếu không người chỉ-branch sẽ 403 ngay), mà check mềm trong handler để hạ phạm vi về branch.
- OpenAPI: hai response **tách biệt** — `GET columns` → `InvoiceReportColumnsResult` = `{ headers: ReportColumnHeader[] }`; `POST search` → `InvoiceReportResult` = `{ dataRaw: ReportCell[][]; totals: ReportCell[] | null; total; page; limit }` (**không** `headers`). Khai DTO/`@ApiProperty` cho `ReportColumnHeader` + `ReportCell` (kể cả `dataRaw` mảng-2-chiều) + `ColumnFilterDto` (request body search) để FE có type chặt; `value` của cell là `string|number|null` (oneOf).

## Testing Strategy

- E2E permission matrix (một phần ở TKT-09): 403 khi thiếu quyền; consolidated vs branch.
- Verify openapi: diff snapshot chỉ có route mới; `pnpm --filter @erp/api build` (nếu có) xanh.

## Dependencies

- Depends on: [TKT-IRB-04](./TKT-IRB-04-be-cqrs-report-search.md), [TKT-IRB-05](./TKT-IRB-05-be-template-cqrs-crud.md) (route đã tồn tại để gắn guard + sinh openapi).
- Blocks: [TKT-IRB-07](./TKT-IRB-07-fe-data-layer.md).
