import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * report_types — global catalogue of selectable invoice-report types
 * (EPIC-11062026). Seeded at startup by ReportTypeSyncService from the code
 * report registry; each `key` maps to a ReportDefinition that owns the columns +
 * aggregation. Not org-scoped — the picker list is the same for every tenant.
 */
export class CreateReportTypes1783800100000 implements MigrationInterface {
  name = 'CreateReportTypes1783800100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "report_types" (
        "id"          uuid NOT NULL DEFAULT uuid_generate_v4(),
        "key"         varchar(80) NOT NULL,
        "name"        varchar(120) NOT NULL,
        "sort_order"  int NOT NULL DEFAULT 0,
        "is_active"   boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_report_types" PRIMARY KEY ("id"),
        CONSTRAINT "uq_report_types_key" UNIQUE ("key")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "report_types"`);
  }
}
