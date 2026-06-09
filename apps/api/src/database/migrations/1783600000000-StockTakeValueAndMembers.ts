import { MigrationInterface, QueryRunner } from "typeorm";

export class StockTakeValueAndMembers1783600000000 implements MigrationInterface {
  name = "StockTakeValueAndMembers1783600000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "stock_takes" ADD COLUMN IF NOT EXISTS "count_by_value" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `ALTER TABLE "stock_take_lines" ADD COLUMN IF NOT EXISTS "expected_value" numeric(18,2) NOT NULL DEFAULT 0`,
    );
    await q.query(
      `ALTER TABLE "stock_take_lines" ADD COLUMN IF NOT EXISTS "counted_value" numeric(18,2) NULL`,
    );
    await q.query(`
      CREATE TABLE IF NOT EXISTS "stock_take_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "stock_take_id" uuid NOT NULL,
        "full_name" character varying(255) NOT NULL,
        "title" character varying(255),
        "representative" character varying(255),
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        CONSTRAINT "PK_stock_take_members" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stock_take_members_stock_take" FOREIGN KEY ("stock_take_id") REFERENCES "stock_takes"("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_stock_take_members_stock_take" ON "stock_take_members" ("stock_take_id")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_stock_take_members_stock_take"`);
    await q.query(`DROP TABLE IF EXISTS "stock_take_members"`);
    await q.query(
      `ALTER TABLE "stock_take_lines" DROP COLUMN IF EXISTS "counted_value"`,
    );
    await q.query(
      `ALTER TABLE "stock_take_lines" DROP COLUMN IF EXISTS "expected_value"`,
    );
    await q.query(
      `ALTER TABLE "stock_takes" DROP COLUMN IF EXISTS "count_by_value"`,
    );
  }
}
