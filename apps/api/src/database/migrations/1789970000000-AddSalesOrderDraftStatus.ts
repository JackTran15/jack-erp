import { MigrationInterface, QueryRunner } from 'typeorm';

/** Lưu tạm đơn: trạng thái `DRAFT` — migration riêng vì enum (xem 1789940000000). */
export class AddSalesOrderDraftStatus1789970000000 implements MigrationInterface {
  name = 'AddSalesOrderDraftStatus1789970000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "sales_order_status_enum" ADD VALUE IF NOT EXISTS 'DRAFT'`);
  }

  public async down(): Promise<void> {
    // Postgres không gỡ được một giá trị enum; giữ nguyên.
  }
}
