import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add unit_price + line_total to goods_issue_lines so issues can carry per-row
 * monetary data (mirrors goods_receipt_lines). Defaults to 0 — legacy rows
 * stay valid, new writes from the UI populate the actual price.
 */
export class AddPriceToGoodsIssueLine1780500000000 implements MigrationInterface {
  name = 'AddPriceToGoodsIssueLine1780500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "goods_issue_lines" ADD COLUMN IF NOT EXISTS "unit_price" numeric(18,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_issue_lines" ADD COLUMN IF NOT EXISTS "line_total" numeric(18,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "goods_issue_lines" DROP COLUMN IF EXISTS "line_total"`);
    await queryRunner.query(`ALTER TABLE "goods_issue_lines" DROP COLUMN IF EXISTS "unit_price"`);
  }
}
