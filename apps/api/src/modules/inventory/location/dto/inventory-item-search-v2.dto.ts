import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CompareFilterDto,
  StringFilterDto,
} from '../../../../common/filters/filter.dto';

/**
 * Request body for the v2 product-grouped inventory item search.
 * Mirrors the per-column filters of the `/admin/inventory-items` list, pushed
 * server-side. Filters are evaluated against the grouped (per-product) rows.
 * Shape matches the backoffice `buildV2Body` convention (StringFilter for text,
 * raw booleans for flags) plus CompareFilter for the money columns.
 */
export class InventoryItemSearchV2Dto {
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

  /** Mã SKU */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  code?: StringFilterDto;

  /** Mã vạch — matches if any barcode of the group matches */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  barcode?: StringFilterDto;

  /** Tên hàng hóa */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  name?: StringFilterDto;

  /** Đơn vị tính */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  unit?: StringFilterDto;

  /** Thương hiệu */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  brand?: StringFilterDto;

  /** Giá mua TB (average purchase price) */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  purchasePrice?: CompareFilterDto;

  /** Giá bán TB (average selling price) */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  sellingPrice?: CompareFilterDto;

  /** Hiển thị trên MH bán hàng */
  @IsOptional()
  @IsBoolean()
  isPosVisible?: boolean;

  /** Trạng thái (active) */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * Include discontinued (isActive=false) items. Defaults to false, so
   * discontinued items are hidden from search unless the caller opts in
   * (e.g. the backoffice management list).
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;
}

/** A single product-grouped row returned by the v2 search. */
export class InventoryItemGroupRowDto {
  @ApiProperty({ enum: ['product', 'orphan'] })
  type!: 'product' | 'orphan';

  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'All barcodes of the group, comma-joined ("" if none)' })
  barcode!: string;

  @ApiProperty()
  unit!: string;

  @ApiProperty({ nullable: true })
  brand!: string | null;

  @ApiProperty({ description: 'Average purchase price across the group' })
  purchasePrice!: number;

  @ApiProperty({ description: 'Average selling price across the group' })
  sellingPrice!: number;

  @ApiProperty()
  isPosVisible!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  itemCount!: number;
}

/** Paginated envelope returned by the v2 search. */
export class InventoryItemSearchV2ResponseDto {
  @ApiProperty({ type: [InventoryItemGroupRowDto] })
  data!: InventoryItemGroupRowDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
