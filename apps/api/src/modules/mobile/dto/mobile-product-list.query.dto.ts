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
 * Tiêu chí sắp xếp do SERVER quyết, không phải client.
 *
 * App có một thanh "Sắp xếp theo" với đúng ba lựa chọn này. Khi server phân
 * trang thì sắp lại ở client là SAI: một mặt hàng ở trang 2 có thể phải đứng
 * trước cả trang 1.
 *
 * CHỈ có tiêu chí, KHÔNG có chiều — màn hình không có nút đảo chiều, và thêm
 * một trục nữa vào đây là thêm một tổ hợp không ai bấm tới. Ngày nào app có
 * nút đảo chiều thì mở rộng ở đây trước.
 */
export enum MobileProductSort {
  NAME = 'name',
  CODE = 'code',
  SELLING_PRICE = 'sellingPrice',
}

export class MobileProductListQueryDto {
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
    enum: MobileProductSort,
    default: MobileProductSort.NAME,
  })
  @IsOptional()
  @IsEnum(MobileProductSort)
  sort?: MobileProductSort = MobileProductSort.NAME;

  /**
   * Tìm theo mã hoặc tên của MẪU MÃ đã gộp.
   *
   * Chỉ hai cột đó, dù CTE còn phơi ra `barcode`: mã vạch là đường của máy quét
   * (app có nút quét riêng), gộp nó vào ô gõ tay thì một chuỗi số dài lọt vào
   * đây sẽ khớp những dòng người dùng không hiểu vì sao lại hiện.
   *
   * KHÔNG bỏ dấu — xem ghi chú ở [MobileSupplierListQueryDto.search].
   */
  @ApiPropertyOptional({ description: 'Tìm theo mã hoặc tên', example: 'ABA' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
