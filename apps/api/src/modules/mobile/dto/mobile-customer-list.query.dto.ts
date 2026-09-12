import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Tham số của `GET /mobile/customers`.
 *
 * Cùng ba trục với mọi danh sách `/mobile/**` khác (`page` / `limit` /
 * `search`) — client dùng chung một `DataListBloc`, nên một endpoint đặt tên
 * tham số khác là một ngoại lệ phải nhớ mãi mãi.
 *
 * KHÔNG có tham số lọc nào khác, dù `CustomerEntity` có hạng thẻ, nhóm khách,
 * trạng thái công nợ. Màn chọn khách chỉ tìm theo tên/số điện thoại; thêm trục
 * lọc chưa ai bấm là mở một bề mặt phải giữ mãi.
 */
export class MobileCustomerListQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Tìm theo mã, tên hoặc số điện thoại' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
