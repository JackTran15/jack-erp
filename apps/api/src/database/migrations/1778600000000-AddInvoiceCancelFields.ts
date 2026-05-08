import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoiceCancelFields1778600000000 implements MigrationInterface {
  name = 'AddInvoiceCancelFields1778600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" ADD "cancelled_at" TIMESTAMPTZ`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD "cancel_reason" TEXT`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "cancel_reason"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "cancelled_at"`);
  }
}
