import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extends `cash_voucher_categories` (Mục thu / Mục chi) with a self-referencing
 * `parent_group_id` (Mục cha, ON DELETE SET NULL) so categories form a parent →
 * child tree like `inventory_item_categories`. Existing rows stay valid as
 * roots: `parent_group_id` NULL. No data is regrouped here — the user builds
 * the tree on the UI (feature 2026091801, A-05).
 */
export class AddCashVoucherCategoryParentGroup1790030000000
  implements MigrationInterface
{
  name = 'AddCashVoucherCategoryParentGroup1790030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cash_voucher_categories" ADD COLUMN IF NOT EXISTS "parent_group_id" uuid`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        ALTER TABLE "cash_voucher_categories"
          ADD CONSTRAINT "FK_cash_voucher_categories_parent_group"
          FOREIGN KEY ("parent_group_id") REFERENCES "cash_voucher_categories"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cash_voucher_categories_parent_group"
       ON "cash_voucher_categories" ("parent_group_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cash_voucher_categories_parent_group"`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        ALTER TABLE "cash_voucher_categories" DROP CONSTRAINT IF EXISTS "FK_cash_voucher_categories_parent_group";
      EXCEPTION WHEN others THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `ALTER TABLE "cash_voucher_categories" DROP COLUMN IF EXISTS "parent_group_id"`,
    );
  }
}
