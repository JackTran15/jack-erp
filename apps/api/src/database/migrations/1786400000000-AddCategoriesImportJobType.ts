import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the CATEGORIES import job type for the item-category (Nhóm hàng hóa)
 * Excel import. Postgres enum values are append-only and cannot be used in
 * the transaction that adds them, so this lives in its own migration.
 * `down` is a no-op.
 */
export class AddCategoriesImportJobType1786400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "inventory_import_jobs_type_enum" ADD VALUE IF NOT EXISTS 'CATEGORIES'`,
    );
    // Keep the column comment in sync with the entity so the next
    // migration:generate doesn't emit a stray COMMENT ON statement.
    await queryRunner.query(
      `COMMENT ON COLUMN "inventory_import_jobs"."type" IS 'What type of data is being imported (ITEMS, OPENING_BALANCES, ADJUSTMENTS, STOCK_TAKE, LOCATIONS, GOODS_RECEIPT, GOODS_ISSUE, STOCK_TRANSFER, TRANSFER_ORDER, CUSTOMERS, CATEGORIES)'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Postgres does not support dropping an enum value — intentional no-op.
  }
}
