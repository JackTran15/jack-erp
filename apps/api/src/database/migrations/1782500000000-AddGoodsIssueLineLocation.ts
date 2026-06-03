import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add a per-line location_id to goods_issue_lines so each issue row can post
 * stock from a different bin/warehouse (mirrors goods_receipt_lines). Existing
 * rows are backfilled from the header (goods_issues.location_id) before the
 * NOT NULL constraint is applied, so legacy single-location issues stay valid.
 */
export class AddGoodsIssueLineLocation1782500000000 implements MigrationInterface {
  name = 'AddGoodsIssueLineLocation1782500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "goods_issue_lines" ADD COLUMN "location_id" uuid NULL`,
    );

    await queryRunner.query(
      `UPDATE "goods_issue_lines" gil SET "location_id" = gi."location_id" FROM "goods_issues" gi WHERE gil."goods_issue_id" = gi."id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "goods_issue_lines" ALTER COLUMN "location_id" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "goods_issue_lines" ADD CONSTRAINT "FK_gil_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "goods_issue_lines" DROP CONSTRAINT IF EXISTS "FK_gil_location"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_issue_lines" DROP COLUMN IF EXISTS "location_id"`,
    );
  }
}
