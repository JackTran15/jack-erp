import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SalesOrderEntity } from './sales-order.entity';

/** Hai việc Admin làm với một đơn chưa có chi nhánh xử lý. */
export enum SalesOrderDispatchAction {
  /** Phân đơn cho một chi nhánh: `sales_orders.branch_id := toBranchId`. */
  DISPATCH = 'DISPATCH',
  /** Chi nhánh trả đơn về pool: `sales_orders.branch_id := NULL` (A-05). */
  RETURN = 'RETURN',
}

/**
 * Vết điều phối đơn hàng — ai phân, phân cho ai, lúc nào, ai trả về, vì sao
 * (A-06, AC-12).
 *
 * Bảng riêng chứ KHÔNG phải hai cột `dispatched_by` / `dispatched_at` trên
 * `sales_orders`: cột chỉ giữ được lần gần nhất, nên một đơn bị trả về hai lần
 * sẽ mất vết lần đầu — đúng cái câu hỏi "vì sao đơn này lòng vòng" cần trả lời.
 *
 * APPEND-ONLY, cố ý:
 * - không `@UpdateDateColumn` — một dòng đã ghi thì không sửa;
 * - không `@DeleteDateColumn` — không xoá mềm, không xoá cứng.
 * Đây là VẾT, không phải bản ghi nghiệp vụ. Đừng thêm đường sửa/xoá vào đây;
 * ghi nhầm thì ghi thêm một dòng đính chính, giống mọi sổ bất biến khác trong
 * repo này.
 *
 * Hình dạng dữ liệu được DB ép bằng `CHK_sales_order_dispatch_events_shape`
 * (migration `1790100200000`), không bằng decorator — repo đặt CHECK ở
 * migration, không dùng `@Check` (xem `CHK_cash_transfer_destination`):
 * - `DISPATCH` → `to_branch_id` bắt buộc; `from_branch_id` NULL ở lần phân đầu,
 *   có giá trị khi phân lại từ chi nhánh khác;
 * - `RETURN`  → `from_branch_id` và `reason` bắt buộc, `to_branch_id` NULL.
 */
@Entity('sales_order_dispatch_events')
@Index('IDX_sales_order_dispatch_events_org_order_created', [
  'organizationId',
  'salesOrderId',
  'createdAt',
])
export class SalesOrderDispatchEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant isolation key — mọi truy vấn lịch sử phải lọc theo cột này. */
  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  @Column({ name: 'sales_order_id', type: 'uuid' })
  salesOrderId: string;

  @Column({
    type: 'enum',
    enum: SalesOrderDispatchAction,
    enumName: 'sales_order_dispatch_action_enum',
  })
  action: SalesOrderDispatchAction;

  /** Chi nhánh đang giữ đơn TRƯỚC hành động; NULL ở lần phân đầu tiên. */
  @Column({ name: 'from_branch_id', type: 'varchar', nullable: true })
  fromBranchId: string | null;

  /** Chi nhánh nhận đơn SAU hành động; NULL khi trả về pool. */
  @Column({ name: 'to_branch_id', type: 'varchar', nullable: true })
  toBranchId: string | null;

  /** `users.id` của người bấm — Admin khi `DISPATCH`, người của chi nhánh khi `RETURN`. */
  @Column({ name: 'actor_user_id', type: 'uuid' })
  actorUserId: string;

  /** Bắt buộc với `RETURN`, tuỳ chọn với `DISPATCH`. */
  @Column({ type: 'varchar', nullable: true })
  reason: string | null;

  /** Thứ tự thời gian của vết; không có cột `updated_at` đi kèm — xem JSDoc lớp. */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => SalesOrderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sales_order_id' })
  salesOrder?: SalesOrderEntity;
}
