import { MigrationInterface, QueryRunner } from 'typeorm';

export class ItemPhase21779900000000 implements MigrationInterface {
  name = 'ItemPhase21779900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── 1. Extend items with brand/itemType/packaging/flags ──────────
    await queryRunner.query(`
      ALTER TABLE "items"
        ADD COLUMN IF NOT EXISTS "brand"                    varchar(100) NULL,
        ADD COLUMN IF NOT EXISTS "item_type"                varchar(100) NULL,
        ADD COLUMN IF NOT EXISTS "package_weight_gram"      numeric(18,2) NULL,
        ADD COLUMN IF NOT EXISTS "package_length_cm"        numeric(18,2) NULL,
        ADD COLUMN IF NOT EXISTS "package_width_cm"         numeric(18,2) NULL,
        ADD COLUMN IF NOT EXISTS "package_height_cm"        numeric(18,2) NULL,
        ADD COLUMN IF NOT EXISTS "is_gold_silver"           boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "odd_size"                 varchar(100) NULL,
        ADD COLUMN IF NOT EXISTS "manage_barcode_per_unit"  boolean NOT NULL DEFAULT false
    `);

    // ─── 2. Create item_units ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "item_units" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "branch_id"        varchar NULL,
        "item_id"          uuid NOT NULL,
        "unit_name"        varchar(50) NOT NULL,
        "ratio"            numeric(18,4) NOT NULL DEFAULT 1,
        "description"      varchar(255) NULL,
        "purchase_price"   numeric(18,2) NOT NULL DEFAULT 0,
        "sell_price"       numeric(18,2) NOT NULL DEFAULT 0,
        "is_default_sell"  boolean NOT NULL DEFAULT false,
        "is_default_buy"   boolean NOT NULL DEFAULT false,
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"       varchar NOT NULL,
        CONSTRAINT "PK_item_units" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_item_units_item_name" UNIQUE ("item_id", "unit_name"),
        CONSTRAINT "FK_item_units_item"
          FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_item_units_org_item" ON "item_units" ("organization_id", "item_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_item_units_default_sell"
         ON "item_units" ("item_id") WHERE "is_default_sell" = true`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_item_units_default_buy"
         ON "item_units" ("item_id") WHERE "is_default_buy" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "item_units"`);
    await queryRunner.query(`
      ALTER TABLE "items"
        DROP COLUMN IF EXISTS "brand",
        DROP COLUMN IF EXISTS "item_type",
        DROP COLUMN IF EXISTS "package_weight_gram",
        DROP COLUMN IF EXISTS "package_length_cm",
        DROP COLUMN IF EXISTS "package_width_cm",
        DROP COLUMN IF EXISTS "package_height_cm",
        DROP COLUMN IF EXISTS "is_gold_silver",
        DROP COLUMN IF EXISTS "odd_size",
        DROP COLUMN IF EXISTS "manage_barcode_per_unit"
    `);
  }
}
