import { MigrationInterface, QueryRunner } from 'typeorm';

export class ItemManagementPhase11779700000000 implements MigrationInterface {
  name = 'ItemManagementPhase11779700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── 1. Alter items: add new columns ──────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "items"
        ADD COLUMN IF NOT EXISTS "category_id"       uuid NULL,
        ADD COLUMN IF NOT EXISTS "is_pos_visible"    boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "weight_gram"       numeric(18,2) NULL,
        ADD COLUMN IF NOT EXISTS "length_cm"         numeric(18,2) NULL,
        ADD COLUMN IF NOT EXISTS "width_cm"          numeric(18,2) NULL,
        ADD COLUMN IF NOT EXISTS "height_cm"         numeric(18,2) NULL,
        ADD COLUMN IF NOT EXISTS "manufacture_year"  smallint NULL,
        ADD COLUMN IF NOT EXISTS "composition"       text NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "items"
         ADD CONSTRAINT "FK_items_category_id"
         FOREIGN KEY ("category_id") REFERENCES "inventory_item_categories"("id")
         ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_items_category_id" ON "items" ("category_id")`,
    );

    // ─── 2. Create item_providers (M2M) ───────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "item_providers" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" varchar NOT NULL,
        "branch_id"       varchar NULL,
        "item_id"         uuid NOT NULL,
        "provider_id"     uuid NOT NULL,
        "is_primary"      boolean NOT NULL DEFAULT false,
        "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"      varchar NOT NULL,
        CONSTRAINT "PK_item_providers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_item_providers_item_provider" UNIQUE ("item_id", "provider_id"),
        CONSTRAINT "FK_item_providers_item"
          FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_item_providers_provider"
          FOREIGN KEY ("provider_id") REFERENCES "inventory_providers"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_item_providers_org_item" ON "item_providers" ("organization_id", "item_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_item_providers_primary"
         ON "item_providers" ("item_id") WHERE "is_primary" = true`,
    );

    // ─── 3. Create item_barcodes ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "item_barcodes" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" varchar NOT NULL,
        "branch_id"       varchar NULL,
        "item_id"         uuid NOT NULL,
        "code"            varchar(100) NOT NULL,
        "notes"           text NULL,
        "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"      varchar NOT NULL,
        CONSTRAINT "PK_item_barcodes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_item_barcodes_org_code" UNIQUE ("organization_id", "code"),
        CONSTRAINT "FK_item_barcodes_item"
          FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_item_barcodes_item" ON "item_barcodes" ("item_id")`,
    );

    // ─── 4. Create item_stock_thresholds ──────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "item_stock_thresholds" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" varchar NOT NULL,
        "branch_id"       varchar NULL,
        "item_id"         uuid NOT NULL,
        "location_id"     uuid NOT NULL,
        "min_qty"         numeric(18,2) NULL,
        "max_qty"         numeric(18,2) NULL,
        "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"      varchar NOT NULL,
        CONSTRAINT "PK_item_stock_thresholds" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_item_stock_thresholds_item_loc" UNIQUE ("item_id", "location_id"),
        CONSTRAINT "FK_item_stock_thresholds_item"
          FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_item_stock_thresholds_loc"
          FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_item_thresholds_org_loc"
         ON "item_stock_thresholds" ("organization_id", "location_id")`,
    );

    // ─── 5. Data migration: category (string) → category_id (FK) ──────
    // Create categories from distinct values (case-insensitive, trimmed).
    await queryRunner.query(`
      INSERT INTO "inventory_item_categories"
        ("id", "organization_id", "name", "created_at", "updated_at", "created_by")
      SELECT DISTINCT
        uuid_generate_v4(),
        i."organization_id",
        TRIM(i."category"),
        NOW(),
        NOW(),
        i."created_by"
      FROM "items" i
      WHERE i."category" IS NOT NULL
        AND TRIM(i."category") <> ''
      ON CONFLICT ("organization_id", "name") DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE "items" i
      SET "category_id" = c."id"
      FROM "inventory_item_categories" c
      WHERE c."organization_id" = i."organization_id"
        AND LOWER(c."name") = LOWER(TRIM(i."category"))
        AND i."category" IS NOT NULL
        AND TRIM(i."category") <> ''
    `);

    // ─── 6. Data migration: provider_id → item_providers ──────────────
    await queryRunner.query(`
      INSERT INTO "item_providers"
        ("organization_id", "branch_id", "item_id", "provider_id", "is_primary", "created_by")
      SELECT
        i."organization_id",
        i."branch_id",
        i."id",
        i."provider_id",
        true,
        i."created_by"
      FROM "items" i
      WHERE i."provider_id" IS NOT NULL
      ON CONFLICT ("item_id", "provider_id") DO NOTHING
    `);

    // ─── 7. Drop legacy columns ───────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "category"`);
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "provider_id"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add legacy columns
    await queryRunner.query(`
      ALTER TABLE "items"
        ADD COLUMN "category"    varchar NULL,
        ADD COLUMN "provider_id" uuid NULL
    `);

    // Best-effort restore category string from FK
    await queryRunner.query(`
      UPDATE "items" i
      SET "category" = c."name"
      FROM "inventory_item_categories" c
      WHERE c."id" = i."category_id"
    `);

    // Best-effort restore provider_id from the primary row (or earliest if duplicates).
    await queryRunner.query(`
      UPDATE "items" i
      SET "provider_id" = sub."provider_id"
      FROM (
        SELECT DISTINCT ON ("item_id")
          "item_id", "provider_id"
        FROM "item_providers"
        ORDER BY "item_id", "is_primary" DESC, "created_at" ASC
      ) sub
      WHERE sub."item_id" = i."id"
    `);

    // Drop new tables
    await queryRunner.query(`DROP TABLE IF EXISTS "item_stock_thresholds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "item_barcodes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "item_providers"`);

    // Drop new columns from items
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_items_category_id"`);
    await queryRunner.query(
      `ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "FK_items_category_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "items"
        DROP COLUMN IF EXISTS "category_id",
        DROP COLUMN IF EXISTS "is_pos_visible",
        DROP COLUMN IF EXISTS "weight_gram",
        DROP COLUMN IF EXISTS "length_cm",
        DROP COLUMN IF EXISTS "width_cm",
        DROP COLUMN IF EXISTS "height_cm",
        DROP COLUMN IF EXISTS "manufacture_year",
        DROP COLUMN IF EXISTS "composition"
    `);
  }
}
