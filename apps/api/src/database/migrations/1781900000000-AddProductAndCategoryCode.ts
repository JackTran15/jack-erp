import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P2 inventory import: adds nullable `code` columns to products and
 * inventory_item_categories so ModelCode / ItemCategoryCode can be
 * persisted and used as a lookup key independent of name.
 */
export class AddProductAndCategoryCode1781900000000 implements MigrationInterface {
  name = 'AddProductAndCategoryCode1781900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "code" character varying
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_products_org_code"
      ON "products" ("organization_id", "code")
      WHERE "code" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_item_categories"
      ADD COLUMN IF NOT EXISTS "code" character varying
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_inventory_item_categories_org_code"
      ON "inventory_item_categories" ("organization_id", "code")
      WHERE "code" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_inventory_item_categories_org_code"`);
    await queryRunner.query(`ALTER TABLE "inventory_item_categories" DROP COLUMN IF EXISTS "code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_products_org_code"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "code"`);
  }
}
