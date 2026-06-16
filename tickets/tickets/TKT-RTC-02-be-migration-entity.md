# TKT-RTC-02 BE: data-transform migration + entity type

## Epic

[EPIC-15062026 Cấu hình cột báo cáo theo template](../epics/EPIC-15062026-report-template-column-config.md)

## Summary

Chuyển dữ liệu cột template đang lưu từ `string[]` → record `{col,displayName,visible,frozen,order}` **tại chỗ** trong cùng cột `jsonb`, và đổi type annotation của `InvoiceReportTemplateEntity.columns`. **Không đổi DDL** (cột vẫn `jsonb` — chỉ `UPDATE` data). Migration **idempotent**: chỉ transform row có element là string, bỏ qua row đã là object.

## Deliverables

- `apps/api/src/database/migrations/<timestamp>-MigrateInvoiceReportTemplateColumns.ts` (mới, hand-written) — `up` string[]→record[], `down` record[]→string[].
- `apps/api/src/modules/reporting/invoice-report/invoice-report-template.entity.ts` — đổi `columns: string[]` → `columns: ReportTemplateColumn[]` (import từ `@erp/shared-interfaces`), cập nhật doc-comment. Decorator `@Column({ type: 'jsonb', default: () => "'[]'" })` **giữ nguyên**.

## Acceptance Criteria

- [ ] `up`: mọi row `columns` là mảng string (kể cả `[]`) → mảng record; mỗi key `k` (index `i`) → `{col:k, displayName:null, visible:true, frozen:false, order:i}`, giữ đúng thứ tự cũ.
- [ ] `down`: mảng record → `string[]` theo `order` tăng dần (chỉ giữ `col`).
- [ ] Idempotent: chạy `up` 2 lần không làm hỏng row đã là record (WHERE lọc theo `jsonb_typeof(columns->0)`).
- [ ] `migration:run` rồi `migration:revert` round-trip sạch trên DB có sẵn ≥1 template cũ.
- [ ] `synchronize` vẫn `false`; không ALTER cột, không bảng mới.

## Definition of Done

- [ ] `pnpm migration:run` + `pnpm migration:revert` chạy được, không lỗi.
- [ ] Entity build xanh (type khớp `ReportTemplateColumn[]` từ TKT-RTC-01).
- [ ] Không Vietnamese trong source.

## Tech Approach

Chọn `<timestamp>` lớn hơn migration mới nhất hiện có (tham chiếu `1783800100000-CreateReportTypes.ts`; xác nhận lại lúc implement bằng `migration:show`).

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateInvoiceReportTemplateColumns1783800200000
  implements MigrationInterface
{
  name = 'MigrateInvoiceReportTemplateColumns1783800200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE "invoice_report_templates"
      SET "columns" = COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'col', elem.value,
            'displayName', NULL,
            'visible', true,
            'frozen', false,
            'order', elem.ord - 1
          ) ORDER BY elem.ord
        )
        FROM jsonb_array_elements_text("columns")
          WITH ORDINALITY AS elem(value, ord)
      ), '[]'::jsonb)
      WHERE jsonb_typeof("columns") = 'array'
        AND ("columns" = '[]'::jsonb OR jsonb_typeof("columns"->0) = 'string')
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE "invoice_report_templates"
      SET "columns" = COALESCE((
        SELECT jsonb_agg(elem->>'col' ORDER BY (elem->>'order')::int)
        FROM jsonb_array_elements("columns") AS elem
      ), '[]'::jsonb)
      WHERE jsonb_typeof("columns") = 'array'
        AND jsonb_typeof("columns"->0) = 'object'
    `);
  }
}
```

Entity:

```ts
import { ReportTemplateColumn } from '@erp/shared-interfaces';
// ...
/** Configured columns: per-column {col, displayName, visible, frozen, order}. */
@Column({ type: 'jsonb', default: () => "'[]'" })
columns: ReportTemplateColumn[];
```

## Testing Strategy

- Manual/migration test: seed 1 template `columns=['date','revenue.total']`, chạy `up`, assert shape record + order; chạy `down`, assert về `['date','revenue.total']`.
- E2E migration test gộp ở TKT-RTC-04 (chạy trên `erp_test`).

## Dependencies

- Depends on: TKT-RTC-01 (type `ReportTemplateColumn`)
- Blocks: TKT-RTC-03
