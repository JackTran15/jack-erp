import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGoodsReceiptImportJob1784000000000
  implements MigrationInterface
{
  name = "AddGoodsReceiptImportJob1784000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "inventory_import_jobs_type_enum" ADD VALUE IF NOT EXISTS 'GOODS_RECEIPT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_import_job_rows" ADD COLUMN IF NOT EXISTS "normalized_data" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_import_job_rows" ADD COLUMN IF NOT EXISTS "warning_messages" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inventory_import_job_rows" DROP COLUMN IF EXISTS "warning_messages"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_import_job_rows" DROP COLUMN IF EXISTS "normalized_data"`,
    );
  }
}
