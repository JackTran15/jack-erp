import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInventoryProviders1777066070787 implements MigrationInterface {
  name = 'AddInventoryProviders1777066070787';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "inventory_providers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "email" character varying,
        "phone" character varying,
        "notes" character varying,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_inventory_providers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_inventory_providers_org_code" UNIQUE ("organization_id", "code")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_inventory_providers_org" ON "inventory_providers" ("organization_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "items" ADD "provider_id" uuid`,
    );

    await queryRunner.query(`
      INSERT INTO "inventory_providers" ("id", "organization_id", "code", "name", "is_active", "created_by", "created_at", "updated_at")
      SELECT
        uuid_generate_v4(),
        i."organization_id",
        '_DEFAULT',
        'Default Provider',
        true,
        i."created_by",
        NOW(),
        NOW()
      FROM (
        SELECT DISTINCT "organization_id", MIN("created_by") AS "created_by"
        FROM "items"
        GROUP BY "organization_id"
      ) i
      WHERE NOT EXISTS (
        SELECT 1 FROM "inventory_providers" p
        WHERE p."organization_id" = i."organization_id" AND p."code" = '_DEFAULT'
      )
    `);

    await queryRunner.query(`
      UPDATE "items" SET "provider_id" = (
        SELECT p."id" FROM "inventory_providers" p
        WHERE p."organization_id" = "items"."organization_id"
          AND p."code" = '_DEFAULT'
        LIMIT 1
      )
      WHERE "provider_id" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "items" ALTER COLUMN "provider_id" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "items" ADD CONSTRAINT "FK_items_provider" FOREIGN KEY ("provider_id") REFERENCES "inventory_providers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_items_provider" ON "items" ("provider_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_items_provider"`);
    await queryRunner.query(
      `ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "FK_items_provider"`,
    );
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN IF EXISTS "provider_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_providers_org"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_providers"`);
  }
}
