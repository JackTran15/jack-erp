import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MobileInventoryKind } from './mobile-inventory-product-list.query.dto';

/**
 * Thứ tự phiếu do SERVER quyết — màn lọc phiếu của app có đúng ba mục.
 * `date` là mới nhất trước, không có chiều ngược vì màn không có mục đó.
 */
export enum MobileInventoryVoucherSort {
  DATE = 'date',
  QUANTITY_ASC = 'quantity_asc',
  QUANTITY_DESC = 'quantity_desc',
}

/** Query của `GET /mobile/inventory/products/:id/stores/:branchId/vouchers`. */
export class MobileInventoryVoucherListQueryDto {
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

  /** Cùng nghĩa `asOf` của các đường tồn kho khác. */
  @ApiPropertyOptional({ example: '2026-09-11' })
  @IsOptional()
  @IsISO8601({ strict: true })
  asOf?: string;

  @ApiPropertyOptional({
    enum: MobileInventoryKind,
    default: MobileInventoryKind.ON_HAND,
  })
  @IsOptional()
  @IsEnum(MobileInventoryKind)
  kind?: MobileInventoryKind = MobileInventoryKind.ON_HAND;

  /** Tìm theo MÃ chứng từ hoặc TÊN kho — hai thứ hiện trên một dòng phiếu. */
  @ApiPropertyOptional({ example: 'NK0001' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /** Thu hẹp về một kho của cửa hàng. Vắng = mọi kho. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  storageId?: string;

  @ApiPropertyOptional({
    enum: MobileInventoryVoucherSort,
    default: MobileInventoryVoucherSort.DATE,
  })
  @IsOptional()
  @IsEnum(MobileInventoryVoucherSort)
  sort?: MobileInventoryVoucherSort = MobileInventoryVoucherSort.DATE;
}
