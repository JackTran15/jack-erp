import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kênh bán trên HOÁ ĐƠN (erp_sales, vai thu ngân — T-16-01).
 *
 * Đơn tư vấn đã có `sales_orders.sales_channel`; hoá đơn nháp sinh từ đơn chép
 * kênh sang, và màn Thu tiền cho đổi kênh ngay trên hoá đơn. Chuỗi tự do như ở
 * đơn (nhãn kênh do MISA/ERP cấu hình), `NULL` = tại cửa hàng (A-65).
 */
export class AddInvoiceSalesChannel1789995000000 implements MigrationInterface {
  name = 'AddInvoiceSalesChannel1789995000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" ADD COLUMN "sales_channel" varchar(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "sales_channel"`);
  }
}
