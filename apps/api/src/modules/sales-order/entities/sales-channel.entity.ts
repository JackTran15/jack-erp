import { Column, DeleteDateColumn, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/**
 * Kênh bán đăng ký được — nguồn của một đơn hàng (ADR-03).
 *
 * Tồn tại để mở Shopee/TikTok/Lazada về sau **không cần migration**: thêm kênh
 * là thêm một dòng dữ liệu, không phải sửa enum. Đó là lý do bảng này có mặt
 * thay vì một `enum` trong schema.
 *
 * Bảng này là phần KHAI BÁO. Phần CHỨNG TỪ vẫn là
 * `sales_orders.sales_channel` (varchar) và `invoices.sales_channel` (varchar) —
 * chúng giữ *snapshot nhãn* lúc đặt, nên đổi tên kênh ở đây không làm đổi tên
 * trên chứng từ cũ. Cố tình lưu hai nơi; đừng "chuẩn hoá" nó đi.
 *
 * Xoá là SOFT: một kênh đã phát sinh đơn mà biến mất thì báo cáo doanh thu theo
 * kênh mất luôn nhóm đó.
 */
@Entity('sales_channels')
@Unique('uq_sales_channels_org_code', ['organizationId', 'code'])
export class SalesChannelEntity extends BaseEntity {
  @Column({ length: 32, comment: 'Mã kênh, duy nhất theo tổ chức — WEB, SHOPEE, TIKTOK…' })
  code: string;

  @Column({ length: 200, comment: 'Tên hiển thị; chính chuỗi này được snapshot xuống đơn và hoá đơn' })
  name: string;

  @Column({
    name: 'is_active',
    default: true,
    comment: 'Kênh ngừng hoạt động không nhận đơn mới; đơn cũ giữ nguyên',
  })
  isActive: boolean;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
