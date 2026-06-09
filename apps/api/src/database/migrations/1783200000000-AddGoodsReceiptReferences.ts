import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Let a goods receipt round-trip the FE-supplied reference codes (Tham chiếu),
 * mirroring goods_issues.references. The receipt already has provider_id /
 * delivered_by / received_at, so only this column is new. Nullable-safe:
 * existing rows default to [].
 */
export class AddGoodsReceiptReferences1783200000000
  implements MigrationInterface
{
  name = 'AddGoodsReceiptReferences1783200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "goods_receipts" ADD COLUMN "references" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "goods_receipts" DROP COLUMN IF EXISTS "references"`,
    );
  }
}
