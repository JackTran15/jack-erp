import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { SalesOrderStatus } from '../entities/sales-order.entity';

/** Tập khoá ĐÓNG (`forbidNonWhitelisted`): trang, cỡ trang, trạng thái, khoảng ngày tạo. */
export class SalesOrderListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(SalesOrderStatus)
  status?: SalesOrderStatus;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /**
   * Hộp thư của thu ngân: đơn CHỜ thu ngân làm gì đó — `SENT` (chờ nhận) HOẶC
   * `PROCESSED` mà hoá đơn còn NHÁP (đã nhận, chưa thu). Thiếu vế sau thì đơn
   * rời hộp thư ngay khi *Nhận xử lý*, và rời giỏ trước khi thu là mất lối mở
   * lại nháp (Loc báo 2026-09-22). Có nó thì [status] bị bỏ qua.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  awaitingCashier?: boolean;
}
