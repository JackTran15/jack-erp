import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { SalesOrderLineEntity } from './sales-order-line.entity';

/**
 * Trạng thái đơn hàng của tư vấn viên. `DRAFT` → `SENT` → một trong ba điểm cuối
 * (`VALID_TRANSITIONS` ở service).
 */
export enum SalesOrderStatus {
  /** Lưu tạm — riêng của người gửi, chưa tới thu ngân; lối ra: `SENT`, hoặc `CANCELLED` (không có xoá). */
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

  /**
   * `employee_profiles.id` của người gửi — cùng khoá với `invoices.salesperson_id`.
   *
   * NULL với đơn web (A-04): ở đó không có ai tư vấn. Phương án "nhân viên hệ
   * thống" giả bị loại vì nó chảy thẳng vào `invoices.salesperson_id` và làm
   * bẩn báo cáo hoa hồng.
   */
  @Column({ name: 'salesperson_id', type: 'uuid', nullable: true })
  salespersonId: string | null;

  /** Tên hiển thị CHỐT lúc gửi — đổi tên nhân viên sau đó không đổi chứng từ cũ. */
  @Column({ name: 'salesperson_name', type: 'varchar', nullable: true })
  salespersonName: string | null;

  /** Nhãn kênh CHỐT lúc đặt. Phần khai báo nằm ở {@link salesChannelId}. */
  @Column({ name: 'sales_channel', type: 'varchar' })
  salesChannel: string;

  /** `sales_channels.id`; NULL với đơn tư vấn viên trên mobile. */
  @Column({ name: 'sales_channel_id', type: 'uuid', nullable: true })
  salesChannelId: string | null;

  /**
   * Mã đơn phía website. Khoá chống tạo trùng: index riêng phần
   * `UNIQUE (organization_id, sales_channel_id, external_order_id)
   *  WHERE external_order_id IS NOT NULL` — đơn mobile không có mã ngoài nên
   * không đụng ràng buộc.
   */
  @Column({ name: 'external_order_id', type: 'varchar', nullable: true })
  externalOrderId: string | null;

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

  /** Phí giao hàng; 0 với đơn mobile. Cùng bài học chuỗi như các cột tiền khác. */
  @Column({ name: 'shipping_fee', type: 'numeric', precision: 18, scale: 2, default: 0 })
  shippingFee: string;

  @Column({ name: 'recipient_name', type: 'varchar', nullable: true })
  recipientName: string | null;

  @Column({ name: 'recipient_phone', type: 'varchar', nullable: true })
  recipientPhone: string | null;

  /**
   * Địa chỉ giao là SNAPSHOT, không FK sang `geo_*` (A-07, ADR-05, AC-03).
   *
   * Cả MÃ lẫn TÊN đều chốt xuống đơn: `geo_wards` mang sẵn `merged_from` cho
   * đợt sáp nhập địa giới, nên đọc lại tên theo dataset mới sẽ làm đơn cũ tự
   * đổi nội dung. Đừng "chuẩn hoá" mấy cột tên này thành join.
   */
  @Column({ name: 'ship_province_code', type: 'varchar', length: 16, nullable: true })
  shipProvinceCode: string | null;

  @Column({ name: 'ship_province_name', type: 'varchar', length: 100, nullable: true })
  shipProvinceName: string | null;

  @Column({ name: 'ship_ward_code', type: 'varchar', length: 8, nullable: true })
  shipWardCode: string | null;

  @Column({ name: 'ship_ward_name', type: 'varchar', length: 100, nullable: true })
  shipWardName: string | null;

  @Column({ name: 'ship_address_line', type: 'varchar', nullable: true })
  shipAddressLine: string | null;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ name: 'reject_reason', type: 'varchar', nullable: true })
  rejectReason: string | null;

  @Column({ name: 'cancel_reason', type: 'varchar', nullable: true })
  cancelReason: string | null;

  /**
   * Điểm tích luỹ khách MUỐN dùng — do tư vấn ghi, thu ngân chốt.
   *
   * KHÔNG trừ vào {@link amountDue}: đơn hàng chưa có hoá đơn nên chưa có gì để
   * trừ, và một tổng đã trừ sẵn là hứa một con số có thể sai lúc thu tiền (khách
   * tiêu điểm ở cửa hàng khác trong lúc đơn còn chờ). `approve` mới là nơi trừ
   * thật, trong cùng transaction tạo hoá đơn nháp.
   */
  @Column({ name: 'points_redeemed', type: 'int', default: 0 })
  pointsRedeemed: number;

  /**
   * Lựa chọn CTKM của tư vấn (ADR-52): bật thêm / gỡ ra. Chỉ là Ý ĐỊNH — số tiền
   * khuyến mại do checkout saga tính lại lúc thu, không bao giờ lấy từ đơn.
   * Thu ngân đọc hai cột này qua draft view (`invoice.salesOrderId`) để biết tư
   * vấn đã bỏ CTKM nào.
   */
  @Column({ name: 'selected_program_ids', type: 'jsonb', default: () => "'[]'" })
  selectedProgramIds: string[];

  @Column({ name: 'excluded_program_ids', type: 'jsonb', default: () => "'[]'" })
  excludedProgramIds: string[];

  /**
   * Hoá đơn nháp do `approve` tạo (ADR-32). Không FK: huỷ hoá đơn chỉ dọn về
   * null. Đọc mã hoá đơn qua join ở `toView` của đường chi tiết.
   */
  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId: string | null;

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
