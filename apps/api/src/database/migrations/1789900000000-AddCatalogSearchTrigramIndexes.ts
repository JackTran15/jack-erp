import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fills the two gaps left by AddTrigramSearchIndexes1781800000000 on the POS
 * branch catalogue search path.
 *
 * That migration covered items.{code,name,brand,variant_label}, customers.*,
 * inventory_item_categories.name and products.name — but the catalogue query
 * also matches `item_barcodes.code` and `products.code`, and neither had a
 * trigram index. On a production restore (41,714 barcodes) the barcode arm
 * alone cost 18.1 ms as a sequential scan; with this index the whole
 * three-arm search runs in 4.6 ms.
 *
 * Not built CONCURRENTLY on purpose: measured at 240 ms and 1,296 kB on that
 * same restore, which is not worth giving up the migration's atomicity for.
 */
export class AddCatalogSearchTrigramIndexes1789900000000
  implements MigrationInterface
{
  name = 'AddCatalogSearchTrigramIndexes1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Already installed by 1781800000000; repeated so a freshly built database
    // does not depend on migration ordering for the extension.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_item_barcodes_code_trgm"
      ON "item_barcodes" USING gin ("code" gin_trgm_ops)
    `);

    // products.code is nullable, and UQ_products_org_code is already partial on
    // the same predicate; matching it keeps the index off the rows that can
    // never satisfy an ILIKE.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_products_code_trgm"
      ON "products" USING gin ("code" gin_trgm_ops)
      WHERE "code" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_code_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_item_barcodes_code_trgm"`);
    // pg_trgm stays: 1781800000000's indexes depend on it.
  }
}
