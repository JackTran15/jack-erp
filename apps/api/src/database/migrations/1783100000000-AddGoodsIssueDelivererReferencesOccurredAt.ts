import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Let a goods issue round-trip the fields the form already collects but used to
 * drop: the deliverer name (Người giao), an FE-supplied list of reference codes
 * (Tham chiếu), and the user-entered issue date+time (Ngày/Giờ xuất). All
 * nullable / defaulted so existing rows stay valid (occurred_at falls back to
 * created_at at read time; references defaults to []).
 */
export class AddGoodsIssueDelivererReferencesOccurredAt1783100000000
  implements MigrationInterface
{
  name = 'AddGoodsIssueDelivererReferencesOccurredAt1783100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "goods_issues" ADD COLUMN "deliverer" varchar NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_issues" ADD COLUMN "references" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_issues" ADD COLUMN "occurred_at" timestamptz NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "goods_issues" DROP COLUMN IF EXISTS "occurred_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_issues" DROP COLUMN IF EXISTS "references"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_issues" DROP COLUMN IF EXISTS "deliverer"`,
    );
  }
}
