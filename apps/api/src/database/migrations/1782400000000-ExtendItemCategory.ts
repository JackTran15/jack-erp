import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extends `inventory_item_categories` with a self-referencing `parent_group_id`
 * (Thuộc nhóm, ON DELETE SET NULL) and a `description` column, and creates the
 * `inventory_item_category_commissions` child table (Hoa hồng theo nhóm hàng).
 * Existing categories are left valid: `parent_group_id` and `description` NULL,
 * no commission rows.
 */
export class ExtendItemCategory1782400000000 implements MigrationInterface {
  name = 'ExtendItemCategory1782400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inventory_item_categories" ADD COLUMN IF NOT EXISTS "parent_group_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_item_categories" ADD COLUMN IF NOT EXISTS "description" text`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        ALTER TABLE "inventory_item_categories"
          ADD CONSTRAINT "FK_item_category_parent"
          FOREIGN KEY ("parent_group_id") REFERENCES "inventory_item_categories"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_item_category_parent"
       ON "inventory_item_categories" ("parent_group_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "inventory_item_category_commissions" (
        "id"                     uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"        character varying        NOT NULL,
        "branch_id"              character varying,
        "created_at"             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by"             character varying        NOT NULL,
        "category_id"            uuid                     NOT NULL,
        "position_id"            uuid,
        "position_name"          character varying,
        "method"                 character varying(20)    NOT NULL DEFAULT 'PERCENT',
        "rate"                   numeric(18,4)            NOT NULL DEFAULT 0,
        "discount_limit_percent" numeric(9,4)             NOT NULL DEFAULT 0,
        CONSTRAINT "PK_item_category_commissions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_item_category_commission_category" FOREIGN KEY ("category_id")
          REFERENCES "inventory_item_categories"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_item_category_commission_category"
       ON "inventory_item_category_commissions" ("category_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_item_category_commission_category"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "inventory_item_category_commissions"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_item_category_parent"`);
    await queryRunner.query(
      `DO $$ BEGIN
        ALTER TABLE "inventory_item_categories" DROP CONSTRAINT IF EXISTS "FK_item_category_parent";
      EXCEPTION WHEN others THEN NULL; END $$;`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_item_categories" DROP COLUMN IF EXISTS "description"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_item_categories" DROP COLUMN IF EXISTS "parent_group_id"`,
    );
  }
}
