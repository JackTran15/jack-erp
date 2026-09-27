import { Column, DeleteDateColumn, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/**
 * Đối tác giao hàng — danh mục của tổ chức (feature
 * 2026092402-pos-order-delivery-lifecycle, ADR-02, A-04).
 *
 * Chỉ là DANH MỤC để lọc / báo cáo theo đối tác; không tích hợp API hãng vận
 * chuyển. Đơn lưu `sales_orders.delivery_partner_id` + `delivery_partner_name`
 * (snapshot tên lúc giao), nên đổi tên đối tác ở đây không đổi đơn cũ.
 *
 * Xoá là SOFT: đối tác đã giao đơn mà biến mất thì báo cáo theo đối tác mất
 * nhóm đó. Mã chỉ duy nhất giữa các đối tác CÒN SỐNG (index riêng phần
 * `WHERE deleted_at IS NULL`) — xoá rồi tạo lại cùng mã là được.
 *
 * Tên index phải khớp migration `1790100700000`, nếu không `migration:generate`
 * lần sau sẽ sinh diff giả.
 */
@Entity('delivery_partners')
@Index('UQ_delivery_partners_org_code', ['organizationId', 'code'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class DeliveryPartnerEntity extends BaseEntity {
  @Column({ length: 32, comment: 'Mã đối tác, duy nhất theo tổ chức trong các đối tác chưa xoá — GHN, GHTK, VTP…' })
  code: string;

  @Column({ length: 200, comment: 'Tên hiển thị; chuỗi này được snapshot xuống đơn lúc giao' })
  name: string;

  @Column({
    name: 'is_active',
    default: true,
    comment: 'Đối tác ngừng hoạt động không chọn được khi giao; đơn cũ giữ nguyên',
  })
  isActive: boolean;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
