# TKT-IRB-05 BE: Template queries + commands + handlers (CQRS CRUD)

## Epic

[EPIC-11062026 Báo cáo tổng hợp bán hàng theo ngày](../epics/EPIC-11062026-invoice-report-builder.md)

## Summary

CRUD template **hoàn toàn theo CQRS**: read = `@QueryHandler` (`List`/`Get`), mutation = `@CommandHandler` (`Create`/`Update`/`Delete`). Mỗi template lưu **bộ cột riêng + bộ filter riêng**, scope ORGANIZATION (org-shared), soft-delete. Tất cả route gắn lên **cùng** `InvoiceReportController` (sub-resource `templates`), dispatch qua `QueryBus`/`CommandBus`. Validate `columns ⊆ registry` + unique `name` theo org.

## Deliverables

- DTOs:
  - `.../dto/create-invoice-report-template.dto.ts` — `name` (`@IsString @Length(1,120)`), `description?`, `columns: string[]` (`@ArrayNotEmpty @IsString({each:true})` — chứa cả key động `*.method.<paymentAccountId>`), `filters?: InvoiceReportFilterDto` (`@ValidateNested`; `issuedAt` ở template có thể để trống và override khi search), `columnFilters?: ColumnFilterDto[]` (`@ValidateNested({each:true})` — per-column filter lưu kèm), `sortOrder?` (`@IsInt @Min(0)`). Persist `filters` jsonb = `{ ...filters, columnFilters }`.
  - `.../dto/update-invoice-report-template.dto.ts` — `PartialType(CreateInvoiceReportTemplateDto)`.
- Queries:
  - `.../queries/list-invoice-report-templates.query.ts` + handler — select theo `organizationId`, `deletedAt IS NULL`, order `sortOrder ASC, createdAt DESC`; map → `InvoiceReportTemplateView[]`.
  - `.../queries/get-invoice-report-template.query.ts` + handler — by id + org scope; not found / cross-tenant → **404**.
- Commands:
  - `.../commands/create-invoice-report-template.command.ts` + handler — validate mỗi key trong `columns` **và** `columnFilters[].col` là **cố định ∈ registry** (`isKnownSummaryColumn`) **hoặc** key động đúng format (`isDynamicColumnKey`); key không thỏa → 400. (Không ép payment-account còn tồn tại — account đổi/xóa sau → key động tự rớt khi search.) name unique theo org (trùng → 409), set `organizationId`/`createdBy` từ actor; insert.
  - `.../commands/update-invoice-report-template.command.ts` + handler — load by id+org (404), validate columns nếu đổi, name unique nếu đổi, update.
  - `.../commands/delete-invoice-report-template.command.ts` + handler — soft-delete by id+org (404).
- `invoice-report.controller.ts` — thêm:
  - `@Get('templates')` `@RequirePermission('reporting.invoice.branch.read')` → `ListInvoiceReportTemplatesQuery`
  - `@Get('templates/:id')` `@RequirePermission('reporting.invoice.branch.read')` → `GetInvoiceReportTemplateQuery`
  - `@Post('templates')` `@RequirePermission('reporting.invoice-template.manage')` → `CreateInvoiceReportTemplateCommand`
  - `@Patch('templates/:id')` `@RequirePermission('reporting.invoice-template.manage')` → `UpdateInvoiceReportTemplateCommand`
  - `@Delete('templates/:id')` `@RequirePermission('reporting.invoice-template.manage')` → `DeleteInvoiceReportTemplateCommand`
- `invoice-report.module.ts` — thêm 2 query handler + 3 command handler vào providers.

## Acceptance Criteria

- [ ] Tất cả read/write qua `QueryBus`/`CommandBus` (không service-thường); controller chỉ dispatch.
- [ ] `columns` chứa key cố định ngoài registry **hoặc** key động sai format (create/update) → **400**.
- [ ] `name` trùng trong cùng org (chưa xóa) → **409**; sau soft-delete tạo lại trùng tên → OK.
- [ ] Mọi query/command lọc `organizationId = actor.organizationId`; id của org khác → **404** (không lộ tồn tại).
- [ ] `Create` set `createdBy = actor.userId`; `filters` rỗng → lưu `{}`; `columns` lưu nguyên mảng đã chọn.
- [ ] `Delete` là soft-delete (`deletedAt`), không xóa cứng; list không trả bản đã xóa.
- [ ] Mutation kế thừa `IdempotencyInterceptor` global (replay cùng `X-Idempotency-Key` → REPLAYED; body khác → 409) — không tự cài lại.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh; app boot (5 handler đăng ký providers).
- [ ] Spec cho mỗi handler: create (happy/validate/unique), update (404/validate), delete (soft), list/get (scope/404).
- [ ] Backend source tiếng Anh.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
@CommandHandler(CreateInvoiceReportTemplateCommand)
export class CreateInvoiceReportTemplateHandler implements ICommandHandler<CreateInvoiceReportTemplateCommand> {
  constructor(@InjectRepository(InvoiceReportTemplateEntity) private readonly repo: Repository<InvoiceReportTemplateEntity>) {}
  async execute({ dto, actor }: CreateInvoiceReportTemplateCommand): Promise<InvoiceReportTemplateView> {
    const keys = [...dto.columns, ...(dto.columnFilters ?? []).map((f) => f.col)];
    const unknown = keys.filter((k) => !isKnownSummaryColumn(k) && !isDynamicColumnKey(k));
    if (unknown.length) throw new BadRequestException(`Unknown report columns: ${[...new Set(unknown)].join(', ')}`);
    const dup = await this.repo.findOne({ where: { organizationId: actor.organizationId, name: dto.name } });
    if (dup) throw new ConflictException('Template name already exists');
    const saved = await this.repo.save(this.repo.create({
      organizationId: actor.organizationId,
      createdBy: actor.userId,
      name: dto.name,
      description: dto.description ?? null,
      columns: dto.columns,
      filters: { ...(dto.filters ?? {}), columnFilters: dto.columnFilters ?? [] } as Record<string, unknown>,
      sortOrder: dto.sortOrder ?? 0,
    }));
    return toView(saved);
  }
}
```

- `GetInvoiceReportTemplateQuery`/`Update`/`Delete` đều `findOne({ where: { id, organizationId } })` → null ⇒ `NotFoundException`.
- `toView(entity)` map entity → `InvoiceReportTemplateView` (ISO date string).
- Controller dispatch giống pattern `invoice-v2`/CQRS skill; `@Actor()` lấy actor, `:id` `@Param('id')`.

## Testing Strategy

- Unit specs cho 5 handler (mock repo): create happy/validate/unique; update 404/validate/unique; delete soft + idempotent re-delete; list order+scope; get 404 cross-tenant.
- E2E round-trip (create→list→get→update→delete) ở TKT-09.

## Dependencies

- Depends on: [TKT-IRB-03](./TKT-IRB-03-be-column-registry-catalog.md) (registry validate), [TKT-IRB-01](./TKT-IRB-01-be-schema-entity-module.md) (entity), [TKT-IRB-02](./TKT-IRB-02-shared-interfaces.md) (`InvoiceReportTemplateView`).
- Blocks: [TKT-IRB-06](./TKT-IRB-06-be-permissions-openapi.md), [TKT-IRB-09](./TKT-IRB-09-tests-e2e.md).
