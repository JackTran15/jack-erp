import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoicePointsRedemption1781600000000 implements MigrationInterface {
  name = 'AddInvoicePointsRedemption1781600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
        ADD COLUMN "points_redeemed" integer NOT NULL DEFAULT 0,
        ADD COLUMN "points_discount_amount" numeric(18,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "invoices"."points_redeemed" IS 'Loyalty points redeemed against this invoice'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "invoices"."points_discount_amount" IS 'Discount granted by loyalty point redemption (pointsRedeemed * POINT_REDEMPTION_VALUE_VND)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "points_discount_amount"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "points_redeemed"`);
  }
}
