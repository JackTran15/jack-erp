import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInventoryItemCategories1777420000000
  implements MigrationInterface
{
  name = 'AddInventoryItemCategories1777420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "inventory_item_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "name" character varying NOT NULL,
        CONSTRAINT "PK_inventory_item_categories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_inventory_item_categories_org_name" UNIQUE ("organization_id", "name")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_inventory_item_categories_org" ON "inventory_item_categories" ("organization_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_item_categories"`);
  }
}
