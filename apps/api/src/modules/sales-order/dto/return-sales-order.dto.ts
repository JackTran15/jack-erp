import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body của `POST /admin/sales-orders/:id/return`.
 *
 * `reason` BẮT BUỘC, khác hẳn {@link CancelSalesOrderDto} nơi lý do để trống
 * được: một dòng `RETURN` trong `sales_order_dispatch_events` mà thiếu lý do bị
 * chính DB từ chối (`CHK_sales_order_dispatch_events_shape`), nên để trống ở đây
 * là đổi một lỗi 400 đọc được thành một lỗi 500 từ driver.
 *
 * `@Transform` cắt khoảng trắng TRƯỚC `@IsNotEmpty`: `"   "` là chuỗi không rỗng
 * với class-validator, nhưng là một lý do rỗng với người đọc lịch sử điều phối.
 */
export class ReturnSalesOrderDto {
  @ApiProperty({ maxLength: 500, description: 'Vì sao chi nhánh trả đơn về pool' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Lý do trả đơn về pool là bắt buộc' })
  @MaxLength(500)
  reason: string;
}
