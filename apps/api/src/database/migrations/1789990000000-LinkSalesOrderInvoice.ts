import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Liên kết HAI CHIỀU đơn hàng tư vấn ↔ hoá đơn (erp_sales, vai thu ngân — ADR-32).
 *
 * `approve` tạo hoá đơn NHÁP từ đơn và ghi cả hai cột; giỏ của thu ngân là hoá
 * đơn nháp đó, tư vấn tra được mã hoá đơn từ đơn. KHÔNG có FK cứng: huỷ hoá đơn
 * nháp chỉ dọn cột về NULL, không được chặn (A-55).
 */
export class LinkSalesOrderInvoice1789990000000 implements MigrationInterface {
  name = 'LinkSalesOrderInvoice1789990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" ADD COLUMN "sales_order_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX "idx_invoices_org_sales_order" ON "invoices" ("organization_id", "sales_order_id") WHERE "sales_order_id" IS NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "sales_orders" ADD COLUMN "invoice_id" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "invoice_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_invoices_org_sales_order"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN IF EXISTS "sales_order_id"`);
  }
}
