# TKT-IRB-01 BE: Migration + InvoiceReportTemplateEntity + module CQRS skeleton

## Epic

[EPIC-11062026 Báo cáo hóa đơn theo cửa hàng / chuỗi](../epics/EPIC-11062026-invoice-report-builder.md)

## Summary

Tạo nền tảng cho feature: bảng mới `invoice_report_templates` (mỗi template mang bộ cột riêng + bộ filter riêng), entity tương ứng, và **module CQRS riêng** `InvoiceReportModule` với **1 controller riêng** `InvoiceReportController` (shell — route được điền dần ở TKT-03/04/05). Đặt nền cho `QueryBus`/`CommandBus`, `TypeOrmModule.forFeature`, và guard.

## Deliverables

- `apps/api/src/database/migrations/<timestamp>-CreateInvoiceReportTemplates.ts` (new) — **hand-written** migration tạo `invoice_report_templates`:
  - `id uuid PK` (default theo convention repo — `gen_random_uuid()`/`uuid_generate_v4()` khớp các migration sẵn có), `organization_id varchar NOT NULL`, `name varchar(120) NOT NULL`, `description text NULL`, `columns jsonb NOT NULL DEFAULT '[]'`, `filters jsonb NOT NULL DEFAULT '{}'`, `sort_order integer NOT NULL DEFAULT 0`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`, `created_by uuid NULL`, `deleted_at timestamptz NULL`.
  - `CREATE UNIQUE INDEX uq_invoice_report_templates_org_name ON invoice_report_templates (organization_id, name) WHERE deleted_at IS NULL;`
  - `CREATE INDEX idx_invoice_report_templates_org_sort ON invoice_report_templates (organization_id, sort_order);`
  - `down()` drop index + table.
- `apps/api/src/modules/reporting/invoice-report/invoice-report-template.entity.ts` — entity scope ORGANIZATION, soft-delete; `columns: string[]` + `filters: Record<string, unknown>` là `jsonb`.
- `apps/api/src/modules/reporting/invoice-report/invoice-report.module.ts` — `imports: [CqrsModule, RbacModule, TypeOrmModule.forFeature([InvoiceReportTemplateEntity, InvoiceEntity, InvoicePaymentEntity, PaymentAccountEntity, BranchEntity])]` (aggregate theo ngày + cột động pivot từ `PaymentAccountEntity`; không cần join customer/salesperson như bản detail trước); `controllers: [InvoiceReportController]`; `providers: []` (handler thêm dần). Wire vào `AppModule` (hoặc re-export qua `ReportingModule`).
- `apps/api/src/modules/reporting/invoice-report/invoice-report.controller.ts` — shell `@Controller('reports/invoices')` + `@UseGuards(PermissionGuard)` + inject `QueryBus` + `CommandBus`. Chưa có route (điền ở TKT-03/04/05).

## Acceptance Criteria

- [ ] App boot được với module mới đăng ký (CqrsModule imported, forFeature các entity hợp lệ — entity gốc define ở module pos/accounting/customer/branch, forFeature chỉ cấp repo).
- [ ] `pnpm migration:run` tạo bảng đúng schema; `pnpm migration:revert` xóa sạch.
- [ ] `synchronize` vẫn false; không entity nào bị auto-sync.
- [ ] Entity scope ORGANIZATION; soft-delete cột `deleted_at` hoạt động (`@DeleteDateColumn`).
- [ ] Unique `(organization_id, name)` chỉ áp khi `deleted_at IS NULL` (xóa rồi tạo lại trùng tên OK).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh; app boot.
- [ ] Migration chạy/revert sạch trên DB local.
- [ ] Backend source tiếng Anh (comment/Swagger/error/log).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
// invoice-report-template.entity.ts — declare cột tường minh (TypeORM 0.3.x không override được cột kế thừa)
@Entity('invoice_report_templates')
@Index('uq_invoice_report_templates_org_name', ['organizationId', 'name'], { unique: true, where: 'deleted_at IS NULL' })
export class InvoiceReportTemplateEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /** Selected report column keys: fixed keys (INVOICE_REPORT_SUMMARY_COLUMNS) + dynamic payment-account keys. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  columns: string[];

  /** Template's own saved filter set (shape = InvoiceReportFilterPayload). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  filters: Record<string, unknown>;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy?: string | null;
  @DeleteDateColumn({ name: 'deleted_at' }) deletedAt?: Date | null;
}
```

> Kiểm tra `BaseEntity`/`SoftDeleteEntity` sẵn có trong repo trước khi declare tay — nếu base đã chuẩn (org + timestamps + softdelete) thì extends, nhưng theo memory `reference_typeorm_cannot_override_inherited_column` nên giữ cột tường minh nếu cần khác nullable/comment.

## Testing Strategy

- Migration smoke: run → assert bảng + 2 index tồn tại; revert → assert sạch.
- Entity repo smoke (nếu cần): insert + soft-delete + unique-name collision.

## Dependencies

- Depends on: — (nền tảng).
- Blocks: [TKT-IRB-03](./TKT-IRB-03-be-column-registry-catalog.md), [TKT-IRB-04](./TKT-IRB-04-be-cqrs-report-search.md), [TKT-IRB-05](./TKT-IRB-05-be-template-cqrs-crud.md).
