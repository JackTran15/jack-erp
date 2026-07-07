# TKT-IVR-06 BE: rename `invoice_report_templates` → `report_templates` + inventory templates CRUD

## Epic

[EPIC-06072026 Báo cáo kho hàng theo structure báo cáo bán hàng](../epics/EPIC-06072026-inventory-report-v2.md)

## Summary

Bảng template trở thành generic cho mọi loại báo cáo (quyết định user): rename table + entity, chuyển entity về `report-core/`, rồi thêm CRUD template cho báo cáo kho dưới `/reports/inventory/templates` — handlers mới validate cột theo `InventoryReportRegistry` qua `buildColumnCatalog` sẵn có. Endpoint template invoice giữ nguyên URL + hành vi.

## Deliverables

- `apps/api/src/database/migrations/<timestamp>-RenameInvoiceReportTemplatesToReportTemplates.ts` (new, hand-written):
  - `up`: `ALTER TABLE invoice_report_templates RENAME TO report_templates`; rename 2 index (`uq_invoice_report_templates_org_type_name` → `uq_report_templates_org_type_name`, `idx_invoice_report_templates_org_sort` → `idx_report_templates_org_sort`).
  - `down`: đảo ngược đầy đủ. Không di chuyển data.
- `apps/api/src/modules/reporting/report-core/report-template.entity.ts` (moved + renamed) — `ReportTemplateEntity`, `@Entity('report_templates')`, giữ nguyên columns/index definitions (tên index mới). File cũ `invoice-report/invoice-report-template.entity.ts` xoá; mọi import site invoice module cập nhật (class alias `InvoiceReportTemplateEntity = ReportTemplateEntity` KHÔNG dùng — đổi thẳng import, diff cơ học).
- `apps/api/src/modules/inventory-reports/dto/` — `CreateInventoryReportTemplateDto` / `UpdateInventoryReportTemplateDto` (mirror DTO invoice: name, description, reportType, columns: `ReportTemplateColumnDto[]` — REUSE class, filters jsonb).
- `apps/api/src/modules/inventory-reports/commands/` — `Create/Update/Delete InventoryReportTemplate` command + handler (~30 dòng/handler, mirror invoice handlers): inject `Repository<ReportTemplateEntity>` + `InventoryReportRegistry`; validate `reportType` ∈ registry, columns qua `buildColumnCatalog` + `normalizeTemplateColumns` (utils sẵn có); org-scoped; soft-delete.
- `apps/api/src/modules/inventory-reports/queries/` — `ListInventoryReportTemplatesQuery` (+ filter reportType) / `GetInventoryReportTemplateQuery` + handlers; view qua `toTemplateView` (tái dùng / move sang report-core cùng entity).
- `inventory-report-v2.controller.ts` (edit) — routes `GET /templates`, `GET /templates/:id`, `POST /templates`, `PATCH /templates/:id`, `DELETE /templates/:id`, permission `inventory.reports.read`.
- Invoice module edits (cơ học): import path entity mới; KHÔNG đổi behavior/URL/DTO.

## Acceptance Criteria

- [ ] Migration: `pnpm migration:run` rồi `pnpm migration:revert` clean trên DB có data template sẵn; data giữ nguyên qua rename.
- [ ] Template CRUD invoice cũ hoạt động y nguyên sau rename (suite invoice template xanh không sửa assertion).
- [ ] Inventory template: create/update validate cột theo catalog đúng reportType kho (nhận `branch.qty.<id>` hợp lệ của org, reject col lạ, reject duplicate, ≥1 visible, order = index); reportType không thuộc inventory registry → 400.
- [ ] Org A không đọc/sửa được template org B; unique (org, reportType, name) enforce qua index.
- [ ] Mutations idempotent (IdempotencyInterceptor toàn cục — không tự implement).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + lint xanh; handler specs (validation + org scope).
- [ ] Không schema change ngoài migration rename; `synchronize` false.
- [ ] Không Vietnamese backend source; không TODO/FIXME.

## Tech Approach

Rename entity bằng move file + đổi `@Entity()` + tên index trong decorator khớp migration. Handlers copy khuôn `create-invoice-report-template.handler.ts` đổi registry injection. `toTemplateView` + `ReportTemplateColumnDto` + `normalizeTemplateColumns` move/re-export về report-core cùng entity (giữ re-export chỗ cũ cho invoice specs).

## Testing Strategy

- Migration test thủ công (run/revert) ghi lại trong PR; unit handler validation matrix; e2e template round-trip nằm ở TKT-IVR-10.

## Dependencies

- Depends on: TKT-IVR-02, TKT-IVR-03 (registry để validate; #5 động test đủ cần TKT-IVR-05 nhưng không block — validation dùng buildColumns runtime)
- Blocks: TKT-IVR-07, TKT-IVR-09
