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
 * Request body for the v2 variant-grouped product search.
 * One row per product, with its variant items aggregated in SQL. Filters are
 * evaluated against the grouped rows. Shape matches the backoffice `buildV2Body`
 * convention (StringFilter for text, raw booleans for flags) plus CompareFilter
 * for the aggregated price columns.
 */
export class ProductSearchV2Dto {
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

  /** Mã sản phẩm */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  code?: StringFilterDto;

  /** Tên sản phẩm */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  name?: StringFilterDto;

  /** Mô tả */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  description?: StringFilterDto;

  /** Thương hiệu — matches if any variant of the product matches */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  brand?: StringFilterDto;

  /** Giá bán TB (average selling price across variants) */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  sellingPrice?: CompareFilterDto;

  /** Số biến thể (variant/item count) */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  variantCount?: CompareFilterDto;

  /** Trạng thái (active) */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** A single variant-grouped product row returned by the v2 search. */
export class ProductSearchV2RowDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  code!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ nullable: true, description: 'Distinct brands across variants, comma-joined' })
  brand!: string | null;

  @ApiProperty({ description: 'Average selling price across variants (0 if none)' })
  sellingPrice!: number;

  @ApiProperty({ description: 'Number of variant items under this product' })
  variantCount!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: string;
}

/** Paginated envelope returned by the v2 search. */
export class ProductSearchV2ResponseDto {
  @ApiProperty({ type: [ProductSearchV2RowDto] })
  data!: ProductSearchV2RowDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
