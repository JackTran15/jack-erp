import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfills the brand and unit master tables from legacy free-text item fields.
 *
 * The item form pickers read inventory_brands and inventory_units, while older
 * items only stored these values in items.brand and items.unit.
 */
export class BackfillInventoryMasterData1783900000000
  implements MigrationInterface
{
  name = 'BackfillInventoryMasterData1783900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "inventory_units"
        ("id", "organization_id", "branch_id", "created_at", "updated_at",
         "created_by", "name", "description", "is_active")
      SELECT
        uuid_generate_v4(),
        legacy."organization_id",
        NULL,
        NOW(),
        NOW(),
        legacy."created_by",
        legacy."name",
        NULL,
        true
      FROM (
        SELECT
          i."organization_id",
          MIN(i."created_by") AS "created_by",
          MIN(TRIM(i."unit")) AS "name"
        FROM "items" i
        WHERE i."unit" IS NOT NULL
          AND TRIM(i."unit") <> ''
        GROUP BY i."organization_id", LOWER(TRIM(i."unit"))
      ) legacy
      WHERE NOT EXISTS (
        SELECT 1
        FROM "inventory_units" u
        WHERE u."organization_id" = legacy."organization_id"
          AND LOWER(TRIM(u."name")) = LOWER(legacy."name")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "inventory_brands"
        ("id", "organization_id", "branch_id", "created_at", "updated_at",
         "created_by", "name")
      SELECT
        uuid_generate_v4(),
        legacy."organization_id",
        NULL,
        NOW(),
        NOW(),
        legacy."created_by",
        legacy."name"
      FROM (
        SELECT
          i."organization_id",
          MIN(i."created_by") AS "created_by",
          MIN(TRIM(i."brand")) AS "name"
        FROM "items" i
        WHERE i."brand" IS NOT NULL
          AND TRIM(i."brand") <> ''
        GROUP BY i."organization_id", LOWER(TRIM(i."brand"))
      ) legacy
      WHERE NOT EXISTS (
        SELECT 1
        FROM "inventory_brands" b
        WHERE b."organization_id" = legacy."organization_id"
          AND LOWER(TRIM(b."name")) = LOWER(legacy."name")
      )
    `);

    await queryRunner.query(`
      UPDATE "items" i
      SET "brand_id" = (
        SELECT b."id"
        FROM "inventory_brands" b
        WHERE b."organization_id" = i."organization_id"
          AND LOWER(TRIM(b."name")) = LOWER(TRIM(i."brand"))
        ORDER BY b."created_at" ASC, b."id" ASC
        LIMIT 1
      )
      WHERE i."brand_id" IS NULL
        AND i."brand" IS NOT NULL
        AND TRIM(i."brand") <> ''
        AND EXISTS (
          SELECT 1
          FROM "inventory_brands" b
          WHERE b."organization_id" = i."organization_id"
            AND LOWER(TRIM(b."name")) = LOWER(TRIM(i."brand"))
        )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Keep backfilled master data because it may be referenced by new records.
  }
}
