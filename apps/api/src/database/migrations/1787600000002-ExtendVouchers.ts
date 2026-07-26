import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendVouchers1787600000002 implements MigrationInterface {
  name = 'ExtendVouchers1787600000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vouchers" ADD COLUMN "issuer" character varying`);
    await queryRunner.query(`ALTER TABLE "vouchers" ADD COLUMN "description" text`);
    // Reuses promotion_status_enum from TKT-KM-02 — same TRACKING/STOPPED semantics (FR-050).
    await queryRunner.query(
      `ALTER TABLE "vouchers" ADD COLUMN "status" "promotion_status_enum" NOT NULL DEFAULT 'TRACKING'`,
    );
    // FR-051: leave start/end date blank for an unlimited-duration voucher.
    await queryRunner.query(`ALTER TABLE "vouchers" ALTER COLUMN "valid_from" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "vouchers" ALTER COLUMN "valid_to" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only safe if no row has a null valid_from/valid_to — will fail otherwise,
    // which is expected: there is no non-destructive way to un-drop NOT NULL
    // once unlimited-duration vouchers exist.
    await queryRunner.query(`ALTER TABLE "vouchers" ALTER COLUMN "valid_to" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "vouchers" ALTER COLUMN "valid_from" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "vouchers" DROP COLUMN "status"`);
    await queryRunner.query(`ALTER TABLE "vouchers" DROP COLUMN "description"`);
    await queryRunner.query(`ALTER TABLE "vouchers" DROP COLUMN "issuer"`);
  }
}
