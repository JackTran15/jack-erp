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
 * Thứ tự sắp xếp do SERVER quyết, không phải client.
 *
 * Màn danh sách sắp theo TÊN, màn chọn nhà cung cấp sắp theo MÃ — hai màn hai
 * tiêu chí, là hành vi có chủ ý của app. Khi server phân trang thì sắp lại ở
 * client là SAI: một NCC ở trang 2 có thể phải đứng trước cả trang 1.
 */
export enum MobileSupplierSort {
  NAME = 'name',
  CODE = 'code',
}

export class MobileSupplierListQueryDto {
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

  @ApiPropertyOptional({ enum: MobileSupplierSort, default: MobileSupplierSort.NAME })
  @IsOptional()
  @IsEnum(MobileSupplierSort)
  sort?: MobileSupplierSort = MobileSupplierSort.NAME;

  /**
   * Tìm theo mã hoặc tên.
   *
   * Hai cột chứ không chỉ tên: mã nhà cung cấp là chuỗi viết tắt ngắn (`ABA`,
   * `TAU`) do chính người dùng đặt, nên họ gõ nó nhanh hơn gõ tên đầy đủ.
   *
   * KHÔNG bỏ dấu — và nay đó là một LỰA CHỌN CHƯA LÀM, không phải một giới
   * hạn. `unaccent` đã bật từ migration `1782500000000` và
   * `SearchCounterpartiesQuery` đã dùng nó từ 2026-09-11; đường NÀY thì chưa,
   * nên `duc tau` vẫn không ra
   * `ĐỨC TÀU`. Giống hệt [MobileItemListQueryDto.search] — hai đường này dùng
   * `ILIKE` trần, và mở `unaccent` cho chúng là một việc riêng: chúng phục vụ
   * màn quản lý kho của erp_manager, không phải màn chọn khách của app bán
   * hàng, nên nó cần người dùng của MÀN ĐÓ xác nhận là đáng.
   */
  @ApiPropertyOptional({ description: 'Tìm theo mã hoặc tên', example: 'ABA' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
