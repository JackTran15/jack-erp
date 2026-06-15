import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Move the preferred-shelf pointer from product-level to item (variant) level so
 * each variant can sit on its own shelf. Replaces `product_storage_locations`
 * (UNIQUE product_id, storage_id) with `item_storage_locations`
 * (UNIQUE item_id, storage_id).
 *
 * up:   create the item-level table, backfill by fanning each product-level row
 *       out to every variant of that product (same storage + location), then drop
 *       the old table.
 * down: best-effort reverse — recreate the product-level table and collapse the
 *       item rows back to one location per (product, storage). This is LOSSY when
 *       a product's variants diverge across locations: the lowest location_id is
 *       picked deterministically.
 */
export class ItemStorageLocations1784200000000 implements MigrationInterface {
  name = 'ItemStorageLocations1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "item_storage_locations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "item_id" uuid NOT NULL,
        "storage_id" uuid NOT NULL,
        "location_id" uuid NOT NULL,
        CONSTRAINT "PK_item_storage_locations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_isl_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_isl_item_storage" UNIQUE ("item_id", "storage_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_isl_storage_location" ON "item_storage_locations" ("storage_id", "location_id")`,
    );

    // Fan each product-level preferred shelf out to all variants of that product.
    await queryRunner.query(`
      INSERT INTO "item_storage_locations"
        ("id", "organization_id", "branch_id", "created_by", "item_id", "storage_id", "location_id")
      SELECT uuid_generate_v4(), psl."organization_id", psl."branch_id", psl."created_by",
             i."id", psl."storage_id", psl."location_id"
      FROM "product_storage_locations" psl
      JOIN "items" i
        ON i."product_id" = psl."product_id"
       AND i."organization_id" = psl."organization_id"
      ON CONFLICT ("item_id", "storage_id") DO NOTHING
    `);

    await queryRunner.query(`DROP TABLE "product_storage_locations"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_storage_locations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "product_id" uuid NOT NULL,
        "storage_id" uuid NOT NULL,
        "location_id" uuid NOT NULL,
        CONSTRAINT "PK_product_storage_locations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_psl_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_psl_product_storage" UNIQUE ("product_id", "storage_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_psl_storage_location" ON "product_storage_locations" ("storage_id", "location_id")`,
    );

    // Collapse item rows back to product level (lossy: one row per
    // product+storage, picked deterministically by lowest location_id).
    await queryRunner.query(`
      INSERT INTO "product_storage_locations"
        ("id", "organization_id", "branch_id", "created_by", "product_id", "storage_id", "location_id")
      SELECT DISTINCT ON (i."product_id", isl."storage_id")
             uuid_generate_v4(), isl."organization_id", isl."branch_id", isl."created_by",
             i."product_id", isl."storage_id", isl."location_id"
      FROM "item_storage_locations" isl
      JOIN "items" i ON i."id" = isl."item_id"
      WHERE i."product_id" IS NOT NULL
      ORDER BY i."product_id", isl."storage_id", isl."location_id"
      ON CONFLICT ("product_id", "storage_id") DO NOTHING
    `);

    await queryRunner.query(`DROP TABLE "item_storage_locations"`);
  }
}
