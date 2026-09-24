import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nhãn thiếu hàng của đơn online (feature 2026092001-online-order-intake-dispatch,
 * T-08-01, ADR-10).
 *
 * - `sales_orders.stock_short` — true khi có ít nhất một dòng
 *   `quantity > chain_stock_at_intake`.
 * - `sales_order_lines.chain_stock_at_intake` — tồn toàn chuỗi chốt lúc nhận đơn.
 *
 * Cả hai là SNAPSHOT ghi lúc nhận đơn, không tính lại lúc đọc.
 *
 * **Không backfill**: đơn cũ và đơn mobile nhận `stock_short = false`,
 * `chain_stock_at_intake = NULL`. NULL nghĩa là "không qua kiểm", KHÁC 0.
 */
export class AddSalesOrderStockShortage1790100500000 implements MigrationInterface {
  name = 'AddSalesOrderStockShortage1790100500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ADD COLUMN "stock_short" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_order_lines" ADD COLUMN "chain_stock_at_intake" numeric`,
    );

    await queryRunner.query(
      `COMMENT ON COLUMN "sales_orders"."stock_short" IS 'Chốt lúc nhận đơn: true khi có dòng quantity > chain_stock_at_intake; đơn cũ/mobile = false'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "sales_order_lines"."chain_stock_at_intake" IS 'Tồn toàn chuỗi chốt lúc nhận đơn; NULL = không qua kiểm (mobile, đơn cũ), khác 0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sales_order_lines" DROP COLUMN IF EXISTS "chain_stock_at_intake"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "stock_short"`,
    );
  }
}
