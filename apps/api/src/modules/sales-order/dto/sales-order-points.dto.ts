import { IsInt, Min } from 'class-validator';

/**
 * Body cho `PATCH /mobile/sales-orders/:id/points` — sửa số điểm DỰ KIẾN.
 *
 * Đường riêng cho MỘT trường, không dùng `PATCH :id`: đường kia đòi quyền tạo
 * đơn (của vai tư vấn), mà thu ngân cũng phải sửa được con số này khi số dư
 * không còn đủ lúc *Nhận xử lý*. Mở rộng quyền của cả đường sửa đơn để phục vụ
 * một trường là cho thu ngân sửa luôn dòng hàng và giá.
 */
export class SalesOrderPointsDto {
  /** `0` = bỏ dự kiến dùng điểm. */
  @IsInt() @Min(0) points: number;
}
