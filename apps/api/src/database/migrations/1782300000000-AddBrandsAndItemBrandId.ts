import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `inventory_brands` table (Thương hiệu master list) and adds a
 * nullable `brand_id` FK on `items` (ON DELETE SET NULL). The legacy free-text
 * `items.brand` column is kept and denormalized from the brand name so existing
 * consumers (e.g. stock-summary brand filter) keep working. Existing items get
 * `brand_id = NULL`.
 */
export class AddBrandsAndItemBrandId1782300000000
  implements MigrationInterface
{
  name = 'AddBrandsAndItemBrandId1782300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "inventory_brands" (
        "id"              uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying        NOT NULL,
        "branch_id"       character varying,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by"      character varying        NOT NULL,
        "name"            character varying(150)   NOT NULL,
        CONSTRAINT "PK_inventory_brands" PRIMARY KEY ("id"),
        CONSTRAINT "uq_inventory_brand_org_name" UNIQUE ("organization_id", "name")
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "brand_id" uuid`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        ALTER TABLE "items"
          ADD CONSTRAINT "FK_items_brand"
          FOREIGN KEY ("brand_id") REFERENCES "inventory_brands"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_items_brand" ON "items" ("brand_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_items_brand"`);
    await queryRunner.query(
      `DO $$ BEGIN
        ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "FK_items_brand";
      EXCEPTION WHEN others THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `ALTER TABLE "items" DROP COLUMN IF EXISTS "brand_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_brands"`);
  }
}
