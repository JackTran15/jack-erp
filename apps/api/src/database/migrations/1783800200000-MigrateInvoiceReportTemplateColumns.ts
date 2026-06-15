import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * EPIC-15062026 — upgrade `invoice_report_templates.columns` from a flat
 * `string[]` of column keys to per-column config records
 * `{ col, displayName, visible, frozen, order }`. Data-only: the column stays
 * `jsonb` (no DDL change). Idempotent — only rows whose elements are still
 * strings are transformed, so re-running `up` is a no-op on already-migrated rows.
 */
export class MigrateInvoiceReportTemplateColumns1783800200000
  implements MigrationInterface
{
  name = 'MigrateInvoiceReportTemplateColumns1783800200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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
