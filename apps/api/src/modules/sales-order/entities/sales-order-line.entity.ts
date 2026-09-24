import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SalesOrderEntity } from './sales-order.entity';

/**
 * Một dòng của đơn hàng tư vấn. Mã / tên / ĐVT là BẢN CHỤP như
 * `invoice_items` — đổi tên hàng sau này không đổi đơn đã gửi.
 */
@Entity('sales_order_lines')
export class SalesOrderLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sales_order_id', type: 'uuid' })
  salesOrderId: string;

  @Column({ name: 'line_no', type: 'int' })
  lineNo: number;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'item_code', type: 'varchar' })
  itemCode: string;

  @Column({ name: 'item_name', type: 'varchar' })
  itemName: string;

  @Column({ type: 'varchar' })
  unit: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  quantity: string;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2 })
  unitPrice: string;

  @Column({ name: 'manual_discount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  manualDiscount: string;

  @Column({ name: 'manual_discount_reason', type: 'varchar', nullable: true })
  manualDiscountReason: string | null;

  /** Khuyến mại CHƯƠNG TRÌNH của dòng, chốt lúc gửi (app tính qua `/v2/promotions/evaluate`). */
  @Column({ name: 'promotion_discount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  promotionDiscount: string;

  @Column({ name: 'promotion_name', type: 'varchar', nullable: true })
  promotionName: string | null;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  /** `quantity * unitPrice`, TRƯỚC mọi khoản giảm. */
  @Column({ name: 'line_total', type: 'numeric', precision: 18, scale: 2 })
  lineTotal: string;

  /**
   * Tồn toàn chuỗi của hàng dòng này, CHỐT lúc nhận đơn (ADR-10) — không tính lại
   * lúc đọc. NULL = đơn không qua kiểm (mobile, đơn cũ), KHÁC 0. Về dạng chuỗi như
   * mọi cột `numeric` khác.
   */
  @Column({ name: 'chain_stock_at_intake', type: 'numeric', nullable: true })
  chainStockAtIntake: string | null;

  @ManyToOne(() => SalesOrderEntity, (order) => order.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder?: SalesOrderEntity;
}
