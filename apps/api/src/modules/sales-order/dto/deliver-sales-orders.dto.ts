import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { BatchSalesOrderDto } from './batch-sales-order.dto';

/**
 * Body của `POST /mobile/sales-orders/deliver` (ADR-07): các đơn đã tick cộng
 * MỘT bộ thông tin giao áp cho tất cả.
 *
 * Đối tác và phí trả ĐT là TUỲ CHỌN (A-04, Akenzy 2026-09-24): bỏ trống thì cột
 * trên đơn là NULL, không phải 0 — NULL nghĩa là "chưa biết".
 */
export class DeliverSalesOrdersDto extends BatchSalesOrderDto {
  /** `delivery_partners.id` — phải đang hoạt động và cùng tổ chức, không thì cả request 400. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  deliveryPartnerId?: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Mã vận đơn' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  trackingCode?: string;

  @ApiPropertyOptional({ minimum: 0, description: 'Phí giao hàng trả đối tác; bỏ trống = NULL' })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  partnerShippingFee?: number;

  @ApiPropertyOptional({ maxLength: 500, description: 'Thông tin gói hàng' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  packageInfo?: string;
}
