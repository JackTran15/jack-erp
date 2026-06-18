import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDocumentLineImportJobTypes1784100000000
  implements MigrationInterface
{
  name = "AddDocumentLineImportJobTypes1784100000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "inventory_import_jobs_type_enum" ADD VALUE IF NOT EXISTS 'GOODS_ISSUE'`,
    );
    await queryRunner.query(
      `ALTER TYPE "inventory_import_jobs_type_enum" ADD VALUE IF NOT EXISTS 'STOCK_TRANSFER'`,
    );
    await queryRunner.query(
      `ALTER TYPE "inventory_import_jobs_type_enum" ADD VALUE IF NOT EXISTS 'TRANSFER_ORDER'`,
    );
  }

  async down(): Promise<void> {
    // PostgreSQL cannot drop individual enum values safely. Keeping these values
    // is harmless and matches the existing inventory import enum migrations.
  }
}
