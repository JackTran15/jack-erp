import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnhanceInventoryItemCategories1782100000000
  implements MigrationInterface
{
  name = 'EnhanceInventoryItemCategories1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'inventory_item_category_status_enum'
        ) THEN
          CREATE TYPE "inventory_item_category_status_enum" AS ENUM ('ACTIVE', 'INACTIVE');
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_item_categories"
        ADD COLUMN IF NOT EXISTS "code" character varying(50),
        ADD COLUMN IF NOT EXISTS "description" character varying(500),
        ADD COLUMN IF NOT EXISTS "status" "inventory_item_category_status_enum" NOT NULL DEFAULT 'ACTIVE'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_item_categories_org_code"
      ON "inventory_item_categories" ("organization_id", "code")
      WHERE "code" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_inventory_item_categories_org_code"`,
    );
    await queryRunner.query(`
      ALTER TABLE "inventory_item_categories"
        DROP COLUMN IF EXISTS "status",
        DROP COLUMN IF EXISTS "is_inactive",
        DROP COLUMN IF EXISTS "description",
        DROP COLUMN IF EXISTS "code"
    `);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "inventory_item_category_status_enum"`,
    );
  }
}
