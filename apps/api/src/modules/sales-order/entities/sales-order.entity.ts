import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { SalesOrderLineEntity } from './sales-order-line.entity';

/**
 * Trạng thái đơn hàng của tư vấn viên. `DRAFT` → `SENT` → một trong ba điểm cuối
 * (`VALID_TRANSITIONS` ở service).
 */
export enum SalesOrderStatus {
  /** Lưu tạm — riêng của người gửi, chưa tới thu ngân; lối ra duy nhất là `SENT` (hoặc xoá). */
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PROCESSED = 'PROCESSED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/**
 * Đơn hàng do TƯ VẤN VIÊN gửi từ app, chờ THU NGÂN nhận xử lý — luồng chỉ có ở
 * mobile. KHÔNG tái dùng `invoices`: bảng đó có `is_draft` nhưng nghĩa là "giữ
 * máy tính tiền", không phải một quy trình duyệt; trộn đơn chưa duyệt vào đó
 * là làm bẩn mọi báo cáo doanh thu / công nợ.
 *
 * Tiền là `numeric(18,2)` và về từ TypeORM dưới dạng CHUỖI — service ép về số
 * ở `toView` (cùng bài học với `MobileInvoiceService.getById`).
 */
@Entity('sales_orders')
@Index('IDX_sales_orders_org_branch_status_created', ['organizationId', 'branchId', 'status', 'createdAt'])
@Index('IDX_sales_orders_org_salesperson_created', ['organizationId', 'salespersonId', 'createdAt'])
export class SalesOrderEntity extends BaseEntity {
  /** `DT000001` — sinh bởi `DocumentNumberingService`, duy nhất theo TỔ CHỨC. */
  @Column({ name: 'document_number', type: 'varchar' })
  documentNumber: string;

  @Column({ type: 'enum', enum: SalesOrderStatus, enumName: 'sales_order_status_enum', default: SalesOrderStatus.SENT })
  status: SalesOrderStatus;

  /** `employee_profiles.id` của người gửi — cùng khoá với `invoices.salesperson_id`. */
  @Column({ name: 'salesperson_id', type: 'uuid' })
  salespersonId: string;

  /** Tên hiển thị CHỐT lúc gửi — đổi tên nhân viên sau đó không đổi chứng từ cũ. */
  @Column({ name: 'salesperson_name', type: 'varchar' })
  salespersonName: string;

  @Column({ name: 'sales_channel', type: 'varchar' })
  salesChannel: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ name: 'customer_name', type: 'varchar', nullable: true })
  customerName: string | null;

  @Column({ name: 'customer_phone', type: 'varchar', nullable: true })
  customerPhone: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  subtotal: string;

  /** Tổng giảm = khuyến mại chương trình + giảm tay của mọi dòng. */
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  discount: string;

  @Column({ name: 'amount_due', type: 'numeric', precision: 18, scale: 2, default: 0 })
  amountDue: string;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ name: 'reject_reason', type: 'varchar', nullable: true })
  rejectReason: string | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'rejected_by', type: 'uuid', nullable: true })
  rejectedBy: string | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt: Date | null;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledBy: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @OneToMany(() => SalesOrderLineEntity, (line) => line.salesOrder, { cascade: ['insert'] })
  lines: SalesOrderLineEntity[];
}
