import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Điểm tích luỹ DỰ KIẾN trên đơn hàng của vai tư vấn (erp_sales).
 *
 * Cột này KHÔNG phải "đã trừ điểm" — đơn hàng chưa có hoá đơn nên chưa có gì để
 * trừ vào. Nó ghi lại số điểm khách MUỐN dùng, và thu ngân mới là người chốt:
 * lúc *Nhận xử lý*, `SalesOrderService.approve` tạo hoá đơn nháp rồi trừ đúng
 * chừng đó điểm **trong cùng transaction**. Thiếu điểm thì cả lượt duyệt bị
 * chặn, không có hoá đơn nào sinh ra (Loc chốt 2026-09-15).
 *
 * Vì thế tổng tiền của đơn KHÔNG trừ cột này — màn đơn bày nó thành một dòng
 * *Dự kiến*, và chữ "dự kiến" là phần quan trọng nhất của dòng đó.
 *
 * `NOT NULL DEFAULT 0` chứ không nullable: "không dùng điểm" và "chưa biết" là
 * cùng một chuyện ở đây, và một cột nullable sẽ bắt mọi nơi đọc phải viết `?? 0`.
 */
export class AddSalesOrderPointsRedeemed1790020000000 implements MigrationInterface {
  name = 'AddSalesOrderPointsRedeemed1790020000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ADD COLUMN "points_redeemed" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "sales_orders"."points_redeemed" IS 'Loyalty points the consultant pencilled in; spent by the cashier at approve time'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales_orders" DROP COLUMN IF EXISTS "points_redeemed"`);
  }
}
