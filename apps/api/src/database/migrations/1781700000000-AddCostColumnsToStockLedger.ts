import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCostColumnsToStockLedger1781700000000 implements MigrationInterface {
  name = 'AddCostColumnsToStockLedger1781700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add nullable cost columns
    await queryRunner.query(`
      ALTER TABLE "stock_ledger_entries"
        ADD COLUMN "unit_cost" numeric(18,2),
        ADD COLUMN "line_value" numeric(18,2)
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "stock_ledger_entries"."unit_cost" IS 'Cost snapshot at posting time; positive for both in/out movements'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "stock_ledger_entries"."line_value" IS 'Signed value = quantity * unit_cost; positive=in, negative=out'
    `);

    // 2. Backfill from goods_receipt_lines (match on reference_type='GOODS_RECEIPT', reference_id, item_id)
    await queryRunner.query(`
      UPDATE "stock_ledger_entries" le
      SET "unit_cost" = grl."unit_price"::numeric,
          "line_value" = (le."quantity"::numeric * grl."unit_price"::numeric)
      FROM "goods_receipt_lines" grl
      WHERE le."reference_type" = 'GOODS_RECEIPT'
        AND le."reference_id" = grl."goods_receipt_id"
        AND le."item_id" = grl."item_id"
        AND le."unit_cost" IS NULL
    `);

    // 3. Backfill from goods_issue_lines (match on reference_type='GOODS_ISSUE', reference_id, item_id)
    await queryRunner.query(`
      UPDATE "stock_ledger_entries" le
      SET "unit_cost" = gil."unit_price"::numeric,
          "line_value" = (le."quantity"::numeric * gil."unit_price"::numeric)
      FROM "goods_issue_lines" gil
      WHERE le."reference_type" = 'GOODS_ISSUE'
        AND le."reference_id" = gil."goods_issue_id"
        AND le."item_id" = gil."item_id"
        AND le."unit_cost" IS NULL
    `);

    // 4. Fallback: use items.purchase_price for any remaining rows (other reference types, missing
    //    line records, etc.)
    await queryRunner.query(`
      UPDATE "stock_ledger_entries" le
      SET "unit_cost" = i."purchase_price"::numeric,
          "line_value" = (le."quantity"::numeric * i."purchase_price"::numeric)
      FROM "items" i
      WHERE le."item_id" = i."id"
        AND le."unit_cost" IS NULL
    `);

    // 5. Index supporting (org, posted_at) date range filter used by inventory reports
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_stock_ledger_org_posted"
      ON "stock_ledger_entries"("organization_id", "posted_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_stock_ledger_org_posted"`);
    await queryRunner.query(`ALTER TABLE "stock_ledger_entries" DROP COLUMN IF EXISTS "line_value"`);
    await queryRunner.query(`ALTER TABLE "stock_ledger_entries" DROP COLUMN IF EXISTS "unit_cost"`);
  }
}
