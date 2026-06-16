import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * invoice_report_templates — saved layouts for the daily sales-summary report
 * builder (EPIC-11062026). ORGANIZATION-scoped, org-shared, soft-deleted.
 * `columns` jsonb holds the selected column keys (fixed + dynamic
 * payment.method.<coaAccountId>); `filters` jsonb holds the saved scope filters
 * plus columnFilters.
 */
export class CreateInvoiceReportTemplates1783800000000
  implements MigrationInterface
{
  name = 'CreateInvoiceReportTemplates1783800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "invoice_report_templates" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "branch_id"        varchar NULL,
        "report_type"      varchar(80) NOT NULL DEFAULT 'daily-sales-summary',
        "name"             varchar(120) NOT NULL,
        "description"      text NULL,
        "columns"          jsonb NOT NULL DEFAULT '[]'::jsonb,
        "filters"          jsonb NOT NULL DEFAULT '{}'::jsonb,
        "sort_order"       int NOT NULL DEFAULT 0,
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMP NULL,
        "created_by"       varchar NOT NULL,
        CONSTRAINT "PK_invoice_report_templates" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_invoice_report_templates_org_type_name" ON "invoice_report_templates" ("organization_id", "report_type", "name") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_invoice_report_templates_org_sort" ON "invoice_report_templates" ("organization_id", "sort_order")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_invoice_report_templates_org_sort"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_invoice_report_templates_org_type_name"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "invoice_report_templates"`,
    );
  }
}
