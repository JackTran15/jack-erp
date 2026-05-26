import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add an optional free-text "description" (Mô tả) to cash voucher categories
 * (Mục thu / Mục chi). The category lookup already carries code/name/direction;
 * this column lets operators annotate what each category is used for.
 */
export class AddDescriptionToCashVoucherCategories1781500000000
  implements MigrationInterface
{
  name = 'AddDescriptionToCashVoucherCategories1781500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cash_voucher_categories" ADD COLUMN IF NOT EXISTS "description" character varying(500) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cash_voucher_categories" DROP COLUMN IF EXISTS "description"`,
    );
  }
}
