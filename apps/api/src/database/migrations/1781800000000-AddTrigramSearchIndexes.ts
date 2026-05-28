import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enables pg_trgm and adds GIN indexes for ILIKE '%term%' search paths on
 * customers and items (including joined category/product name search).
 */
export class AddTrigramSearchIndexes1781800000000 implements MigrationInterface {
  name = 'AddTrigramSearchIndexes1781800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // customers — BaseCrudService searchableFields: code, name, email, phone
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customers_name_trgm"
      ON "customers" USING gin ("name" gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customers_code_trgm"
      ON "customers" USING gin ("code" gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customers_email_trgm"
      ON "customers" USING gin ("email" gin_trgm_ops)
      WHERE "email" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customers_phone_trgm"
      ON "customers" USING gin ("phone" gin_trgm_ops)
      WHERE "phone" IS NOT NULL
    `);

    // items — backoffice list + POS catalog search (code, name, brand, variant_label)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_items_code_trgm"
      ON "items" USING gin ("code" gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_items_name_trgm"
      ON "items" USING gin ("name" gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_items_brand_trgm"
      ON "items" USING gin ("brand" gin_trgm_ops)
      WHERE "brand" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_items_variant_label_trgm"
      ON "items" USING gin ("variant_label" gin_trgm_ops)
      WHERE "variant_label" IS NOT NULL
    `);

    // item list search joins category.name and product.name
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_item_categories_name_trgm"
      ON "inventory_item_categories" USING gin ("name" gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_products_name_trgm"
      ON "products" USING gin ("name" gin_trgm_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_item_categories_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_items_variant_label_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_items_brand_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_items_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_items_code_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_phone_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_email_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_code_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_name_trgm"`);
    // Keep pg_trgm installed — other indexes or extensions may depend on it.
  }
}
