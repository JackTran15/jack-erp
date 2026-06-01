import { MigrationInterface, QueryRunner } from 'typeorm';

/** Creates the `inventory_units` table for the Đơn vị tính (unit of measure) master list. */
export class AddInventoryUnits1782200000000 implements MigrationInterface {
  name = 'AddInventoryUnits1782200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "inventory_units" (
        "id"              uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying        NOT NULL,
        "branch_id"       character varying,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by"      character varying        NOT NULL,
        "name"            character varying(50)    NOT NULL,
        "description"     text,
        "is_active"       boolean                  NOT NULL DEFAULT true,
        CONSTRAINT "PK_inventory_units" PRIMARY KEY ("id"),
        CONSTRAINT "uq_inventory_unit_org_name" UNIQUE ("organization_id", "name")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_inventory_units_org_active"
       ON "inventory_units" ("organization_id", "is_active")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_inventory_units_org_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_units"`);
  }
}
