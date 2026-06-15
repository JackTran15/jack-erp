# TKT-IRD-03 BE: InvoiceItemRevenueDetailReport + filter customer/cashier/salesperson

## Epic

[EPIC-14062026 Chi tiết doanh thu theo hóa đơn và mặt hàng](../epics/EPIC-14062026-invoice-item-revenue-detail-report.md)

## Summary

Hiện thực `ReportDefinition` thứ 3 — `InvoiceItemRevenueDetailReport` (key `invoice-item-revenue-detail`). `buildColumns` trả catalog phẳng từ `INVOICE_ITEM_REVENUE_COLUMNS`. `buildData` fetch hóa đơn (`status != cancelled`, trong `filters.issuedAt`, theo scope + 3 filter mới), fetch `invoice_items IN(invoiceIds)`, join inline customer/customer-group/branch/employee/user/item/category/location/supplier, dựng **một dòng / một dòng hàng** trong JS qua aggregator TKT-IRD-02, áp `columnFilters` post-build, trả `{ dataRaw, totals, total, page, limit }`. Thêm 3 filter optional vào `InvoiceReportFilterDto` và áp tại tầng SQL.

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/reports/invoice-item-revenue-detail.report.ts` (mới).
- `apps/api/src/modules/reporting/invoice-report/reports/invoice-item-revenue-detail.report.spec.ts` (mới).
- `apps/api/src/modules/reporting/invoice-report/dto/invoice-report-filter.dto.ts` — thêm `customerId?`, `cashierId?`, `salespersonId?` (`@IsOptional() @IsUUID()`).

## Acceptance Criteria

- [ ] `key === 'invoice-item-revenue-detail'`.
- [ ] `buildColumns`: trả cố định từ `INVOICE_ITEM_REVENUE_COLUMNS` (`name` = `INVOICE_REPORT_COLUMN_LABELS_VI[key] ?? key`, `desc: null`, `group: null`). Không cột động.
- [ ] `buildData`: bắt buộc `filters.issuedAt.from` (thiếu → `BadRequestException`); validate `columns` + `columnFilters[].col` ∈ registry → lạ → `BadRequestException`.
- [ ] Scope: `resolveBranchScope(dto.branchId ?? dto.filters.branchId, actor)` (gate `reporting.invoice.consolidated.read`); branch khác không quyền → `ForbiddenException`.
- [ ] Query hóa đơn: `organizationId` AND `status != cancelled` AND (branch nếu có) + `FilterBuilder.applyDateRange(issuedAt).applyEnum(status).applyEnum(type).applyEnum(customerId).applyEnum(staffId=cashierId).applyEnum(salespersonId)`.
- [ ] Fetch `invoice_items WHERE invoiceId IN(...)` → **một dòng / một dòng hàng**. FK resolve **inline** vào từng dòng (KHÔNG root map). Aux chỉ fetch khi cột tham chiếu cần (`needsCustomer`/`needsCategory`/`needsSupplier`/`needsLocation`/...).
- [ ] Cashier: `staffId → employee_profiles.code` (mã) + `staffId → users.name` (tên). Salesperson: `salespersonId → employee_profiles.code` + `→ employee_profiles.userId → users.name`.
- [ ] `columnFilters` post-build qua `matchColumnFilter`; `totals` (số lượng/tiền) trên tập sau filter; phân trang `page`/`limit`.
- [ ] 2 report type cũ không regress.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- invoice-item-revenue-detail.report` xanh.
- [ ] `pnpm --filter @erp/api build` xanh.
- [ ] Không tiếng Việt trong source (trừ fixture test); `synchronize` vẫn false; không schema change.

## Tech Approach

- Resolve branch/customer/employee/item/category/location/provider bằng `find({ where: { id: In(ids), organizationId } })` rồi map inline trong JS (đúng feedback in-memory + inline-relations), tránh cast `::uuid` SQL.
- `lineAmount` = `quantity * unitPrice` (gross, derived); `lineRevenue` = `lineTotal` (server-canonical, KHÔNG tính lại).

## Dependencies

- Depends on: TKT-IRD-01, TKT-IRD-02
- Blocks: TKT-IRD-04
