import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the CUSTOMERS import job type so customer Excel imports can reuse the
 * shared inventory_import_jobs / inventory_import_job_rows infrastructure.
 * Postgres enum values are append-only and cannot be used in the same
 * transaction they are added in, so this lives in its own migration.
 * `down` is a no-op.
 */
export class AddCustomerImportJobType1786300000000
  implements MigrationInterface
{
  name = 'AddCustomerImportJobType1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "inventory_import_jobs_type_enum" ADD VALUE IF NOT EXISTS 'CUSTOMERS'`,
    );
    // Keep the column comment in sync with the entity so the next
    // migration:generate doesn't emit a stray COMMENT ON statement.
    await queryRunner.query(
      `COMMENT ON COLUMN "inventory_import_jobs"."type" IS 'What type of data is being imported (ITEMS, OPENING_BALANCES, ADJUSTMENTS, STOCK_TAKE, LOCATIONS, GOODS_RECEIPT, GOODS_ISSUE, STOCK_TRANSFER, TRANSFER_ORDER, CUSTOMERS)'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Postgres does not support dropping an enum value — intentional no-op.
  }
}
