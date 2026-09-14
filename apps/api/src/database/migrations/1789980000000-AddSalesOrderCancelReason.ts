import { MigrationInterface, QueryRunner } from 'typeorm';

/** Lý do huỷ đơn (MISA: hộp thoại "Lý do hủy"). Không có `DELETE` — đơn lưu tạm cũng HUỶ. */
export class AddSalesOrderCancelReason1789980000000 implements MigrationInterface {
  name = 'AddSalesOrderCancelReason1789980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD COLUMN "cancel_reason" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "cancel_reason"`);
  }
}
