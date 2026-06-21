import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add an explicit "Đối tượng" (counterparty) to goods receipt and goods issue
 * documents so the v2 flows can target either a supplier (NCC) or a customer.
 * The legacy provider_id column is kept for back-compat; the new columns are
 * nullable so existing rows stay valid.
 */
export class AddGoodsDocCounterparty1784600000000
  implements MigrationInterface
{
  name = 'AddGoodsDocCounterparty1784600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "doc_counterparty_kind_enum" AS ENUM ('supplier', 'customer')`,
    );

    await queryRunner.query(
      `ALTER TABLE "goods_receipts" ADD COLUMN "counterparty_kind" "doc_counterparty_kind_enum" NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipts" ADD COLUMN "counterparty_id" uuid NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "goods_issues" ADD COLUMN "counterparty_kind" "doc_counterparty_kind_enum" NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_issues" ADD COLUMN "counterparty_id" uuid NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "goods_issues" DROP COLUMN IF EXISTS "counterparty_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_issues" DROP COLUMN IF EXISTS "counterparty_kind"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipts" DROP COLUMN IF EXISTS "counterparty_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipts" DROP COLUMN IF EXISTS "counterparty_kind"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "doc_counterparty_kind_enum"`);
  }
}
