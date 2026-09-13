import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Tiêu chí sắp xếp do SERVER quyết — cùng lý do đã ghi ở `MobileProductSort`:
 * server phân trang thì sắp lại ở client là sai.
 *
 * Hai tiêu chí khớp đúng màn lọc của app ("Tên khách hàng" / "Doanh thu").
 * `revenue` KHÔNG phải cột của `customers` — nó là tổng hoá đơn đã chốt, tính
 * trong CTE của `MobileCustomerService`.
 */
export enum MobileCustomerSort {
  NAME = 'name',
  REVENUE = 'revenue',
}

/**
 * Chiều sắp xếp — endpoint mobile ĐẦU TIÊN nhận chiều, và đó là lệch có lý do:
 * màn lọc khách hàng vẽ hẳn hai mục "Doanh thu tăng dần" / "Doanh thu giảm
 * dần", còn hàng hoá và nhà cung cấp không có nút đảo chiều nào.
 */
export enum MobileCustomerOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Trạng thái theo dõi — VIẾT THƯỜNG như `MobileSupplierResponseDto.status`,
 * service dịch sang `ACTIVE`/`INACTIVE` của cột. `MERGED` cố ý KHÔNG có ở đây:
 * khách đã gộp không còn là khách, danh sách luôn loại nó.
 */
export enum MobileCustomerStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

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

  @ApiPropertyOptional({
    enum: MobileCustomerSort,
    default: MobileCustomerSort.NAME,
  })
  @IsOptional()
  @IsEnum(MobileCustomerSort)
  sort?: MobileCustomerSort = MobileCustomerSort.NAME;

  @ApiPropertyOptional({
    enum: MobileCustomerOrder,
    default: MobileCustomerOrder.ASC,
  })
  @IsOptional()
  @IsEnum(MobileCustomerOrder)
  order?: MobileCustomerOrder = MobileCustomerOrder.ASC;

  /** Vắng = cả đang theo dõi lẫn đã ngừng (màn tìm kiếm không lọc). */
  @ApiPropertyOptional({ enum: MobileCustomerStatus })
  @IsOptional()
  @IsEnum(MobileCustomerStatus)
  status?: MobileCustomerStatus;

  /**
   * Tìm theo mã, tên hoặc SỐ ĐIỆN THOẠI.
   *
   * Thêm số điện thoại so với nhà cung cấp vì màn khách hàng vẽ nó ngay dưới
   * tên — đó là thứ người dùng nhìn thấy và gõ lại. KHÔNG bỏ dấu, xem ghi chú
   * ở [MobileSupplierListQueryDto.search].
   */
  @ApiPropertyOptional({
    description: 'Tìm theo mã, tên hoặc số điện thoại',
    example: '0901',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
