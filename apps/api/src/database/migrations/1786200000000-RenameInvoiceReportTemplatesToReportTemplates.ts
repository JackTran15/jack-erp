import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The template table now stores layouts for BOTH invoice and inventory
 * reports, so the invoice-specific name is renamed to the generic
 * `report_templates` (+ its two indexes). Pure rename — no data movement,
 * no column/DDL change.
 */
export class RenameInvoiceReportTemplatesToReportTemplates1786200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice_report_templates" RENAME TO "report_templates"`,
    );
    await queryRunner.query(
      `ALTER INDEX "uq_invoice_report_templates_org_type_name" RENAME TO "uq_report_templates_org_type_name"`,
    );
    await queryRunner.query(
      `ALTER INDEX "idx_invoice_report_templates_org_sort" RENAME TO "idx_report_templates_org_sort"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER INDEX "idx_report_templates_org_sort" RENAME TO "idx_invoice_report_templates_org_sort"`,
    );
    await queryRunner.query(
      `ALTER INDEX "uq_report_templates_org_type_name" RENAME TO "uq_invoice_report_templates_org_type_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "report_templates" RENAME TO "invoice_report_templates"`,
    );
  }
}
