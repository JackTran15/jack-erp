# TKT-RTC-03 BE: DTO record cột + validate theo reportType + handlers + view

## Epic

[EPIC-15062026 Cấu hình cột báo cáo theo template](../epics/EPIC-15062026-report-template-column-config.md)

## Summary

Nhận/validate/persist **record cột** ở 2 command handler template. Thêm nested DTO `ReportTemplateColumnDto`; đổi field `columns` trên Create/Update DTO sang `ReportTemplateColumnDto[]`. Thay validate cột từ `isAcceptedColumnKey` (daily-sales-only) sang validate theo **catalog của `reportType`** (`ReportRegistry.get(reportType).buildColumns(actor)`). Map record qua `toTemplateView` (passthrough). Đây là phần lõi của epic.

## Deliverables

- `apps/api/src/modules/reporting/invoice-report/dto/report-template-column.dto.ts` (mới) — `ReportTemplateColumnDto`.
- `apps/api/src/modules/reporting/invoice-report/dto/create-invoice-report-template.dto.ts` — `columns: ReportTemplateColumnDto[]` (`@ValidateNested({each})` + `@Type`), giữ `@ArrayNotEmpty`.
- `apps/api/src/modules/reporting/invoice-report/dto/update-invoice-report-template.dto.ts` — `columns?: ReportTemplateColumnDto[]` (optional, full-replace).
- `apps/api/src/modules/reporting/invoice-report/commands/create-invoice-report-template.handler.ts` — inject `ReportRegistry`; validate cột theo catalog reportType; normalize + persist record.
- `apps/api/src/modules/reporting/invoice-report/commands/update-invoice-report-template.handler.ts` — đối xứng, validate theo `entity.reportType`; `entity.columns = normalize(dto.columns)` khi có.
- `apps/api/src/modules/reporting/invoice-report/invoice-report-template.view.ts` — `columns: e.columns ?? []` đã là record (chỉ cập nhật type, không reshape).
- (Tùy chọn, nếu muốn dùng chung) một helper `normalizeTemplateColumns(records)` cạnh handler.

## Acceptance Criteria

- [ ] Validate **theo reportType**: cột hợp lệ ⇔ `col` ∈ catalog `ReportRegistry.get(reportType).buildColumns(actor)` (gồm cột động `payment.method.<id>` thực tế của org). `columnFilters[].col` cũng validate cùng tập. Cột lạ → `BadRequestException` liệt kê key sai.
- [ ] Template cho **cả 3** report type tạo được bằng key cột riêng của loại đó (regression: `daily-sales-summary` vẫn chạy).
- [ ] Reject khi: mảng rỗng (Create), **trùng `col`**, **không có cột nào `visible:true`**.
- [ ] Normalize khi lưu: `order` = vị trí trong mảng (0..n-1, bỏ qua `order` client gửi); `displayName` trim, chuỗi rỗng → `null`.
- [ ] Update là **full-replace** `columns` (giống hành vi `string[]` cũ), không patch từng cột; bỏ qua `columns` khi DTO không gửi.
- [ ] Mọi query vẫn filter `actor.organizationId`; mutation kế thừa `IdempotencyInterceptor` (không tự xử lý).
- [ ] `isAcceptedColumnKey` **không** còn được import ở 2 handler template (vẫn tồn tại cho path khác).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] Unit spec phủ: valid 3 reportType, unknown-col-reject-theo-type, duplicate-col, no-visible-reject, order-normalize, displayName-trim/null, empty-array (create) (chi tiết ở TKT-RTC-04 nhưng spec file thuộc ticket này nếu thuận tiện).
- [ ] Không Vietnamese trong source. Không schema change ngoài migration (TKT-RTC-02).

## Tech Approach

```ts
// report-template-column.dto.ts
import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class ReportTemplateColumnDto {
  @IsString()
  @Length(1, 120)
  col: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  displayName?: string | null;

  @IsOptional()
  @IsBoolean()
  visible?: boolean; // default true

  @IsOptional()
  @IsBoolean()
  frozen?: boolean; // default false

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number; // ignored on persist (server stamps array index)
}
```

```ts
// create handler (lõi)
constructor(
  @InjectRepository(InvoiceReportTemplateEntity) private readonly repo: ...,
  private readonly registry: ReportRegistry,
) {}

private async validateAndNormalize(
  reportType: string,
  cols: ReportTemplateColumnDto[],
  columnFilters: { col: string }[],
  actor: ActorContext,
): Promise<ReportTemplateColumn[]> {
  const def = this.registry.get(reportType);
  if (!def) throw new BadRequestException(`Unknown report type: ${reportType}`);
  const catalog = new Set((await def.buildColumns(actor)).map((h) => h.col));

  const referenced = [...cols.map((c) => c.col), ...columnFilters.map((f) => f.col)];
  const unknown = referenced.filter((k) => !catalog.has(k));
  if (unknown.length)
    throw new BadRequestException(
      `Unknown report columns: ${[...new Set(unknown)].join(', ')}`,
    );

  const keys = cols.map((c) => c.col);
  if (new Set(keys).size !== keys.length)
    throw new BadRequestException('Duplicate report columns');

  const normalized = cols.map((c, i) => ({
    col: c.col,
    displayName: c.displayName?.trim() ? c.displayName.trim() : null,
    visible: c.visible ?? true,
    frozen: c.frozen ?? false,
    order: i,
  }));
  if (!normalized.some((c) => c.visible))
    throw new BadRequestException('At least one column must be visible');
  return normalized;
}
```

> Catalog-based validate thay regex cũ: cột `payment.method.<id>` giờ phải khớp **tài khoản thật** của org (chặt hơn, đúng hơn). Template trỏ account đã xoá sẽ bị reject — chấp nhận được (edge case hiếm).

## Testing Strategy

- Unit (`create/update-invoice-report-template.handler.spec.ts`): mock `ReportRegistry` trả catalog theo từng reportType; assert từng nhánh validate + normalize.

## Dependencies

- Depends on: TKT-RTC-01 (type), TKT-RTC-02 (entity type)
- Blocks: TKT-RTC-04
