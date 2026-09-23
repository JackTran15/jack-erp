import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `invoices.shipping_fee_amount` — phí giao hàng thu khách nằm trên HOÁ ĐƠN
 * (feature 2026092001-online-order-intake-dispatch, ADR-04 / A-16).
 *
 * A-16 giả định phí chỉ nằm trên `sales_orders`; Akenzy BÁC BỎ ngày 2026-09-20:
 * số shipper phải thu buộc phải bằng đúng `invoices.amount_due`, nếu không cột
 * "Thu hộ" là một phép cộng tay và `invoice_debts.original_amount` thu thiếu.
 * EPIC-14062026 đã khảo sát và xác nhận `invoices` không có cột phí nào —
 * "Tiền phí" trong báo cáo doanh thu là PLACEHOLDER 0. Cột này là backing thật
 * cho nó.
 *
 * `NOT NULL DEFAULT 0` là cố ý: mọi hoá đơn đã phát hành đều ra `0`, nên KHÔNG
 * cần backfill và không hoá đơn cũ nào đổi số. Nullable sẽ đẩy một nhánh
 * `?? 0` vào cả ba nơi tính tổng (`computeAmountDue`, `invoiceSignedTotalSql`,
 * `pos-web/.../invoiceAmount.ts`) — thêm đúng cái chỗ để lệch nhau.
 *
 * Migration này là NO-OP về mặt số: công thức `amount_due` chưa cộng phí cho
 * tới T-04-02. Tách ra để bước đổi công thức có thể revert riêng mà không phải
 * drop cột đã có dữ liệu.
 */
export class AddInvoiceShippingFee1790100300000 implements MigrationInterface {
  name = 'AddInvoiceShippingFee1790100300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
        ADD COLUMN "shipping_fee_amount" numeric(18,2) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(
      `COMMENT ON COLUMN "invoices"."shipping_fee_amount" IS 'Phí giao hàng THU KHÁCH (ADR-04). KHÔNG phải doanh thu hàng hoá — hạch toán riêng, còn treo ở A-21. Không bị chiết khấu/điểm tích trừ vào: cộng vào amount_due SAU mọi khoản giảm và sau khi phần tiền hàng đã clamp về 0 (A-22). Hoá đơn RETURN/EXCHANGE luôn 0 — phí đã thu không hoàn (A-23)'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "shipping_fee_amount"`,
    );
  }
}
