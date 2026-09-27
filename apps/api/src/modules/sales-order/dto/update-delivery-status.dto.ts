import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DeliveryStatus } from '../entities/sales-order.entity';
import { BatchSalesOrderDto } from './batch-sales-order.dto';

/**
 * Body của `POST /mobile/sales-orders/delivery-status` — "Cập nhật TT" và
 * "Hoàn thành" (A-08, A-09). Bước chuyển hợp lệ do `DELIVERY_TRANSITIONS`
 * quyết định ở service, không ở đây.
 */
export class UpdateDeliveryStatusDto extends BatchSalesOrderDto {
  @ApiProperty({ enum: DeliveryStatus, enumName: 'DeliveryStatus' })
  @IsEnum(DeliveryStatus)
  to: DeliveryStatus;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
