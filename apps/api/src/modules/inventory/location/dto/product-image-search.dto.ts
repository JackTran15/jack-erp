import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum ProductImageStatusFilter {
  ALL = 'ALL',
  MISSING = 'MISSING',
  PRESENT = 'PRESENT',
}

/**
 * Request body for `POST /v2/inventory-items/images/search` — the "Update
 * images" utility page. Groups are the same product/orphan rows as the v2
 * item search (`buildCombinedCte()`), restricted to active groups; there is
 * deliberately no `includeInactive` (A-13).
 */
export class ProductImageSearchDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  /** MISSING = no ATTACHED image, PRESENT = at least one, ALL = no predicate. */
  @ApiPropertyOptional({
    enum: ProductImageStatusFilter,
    default: ProductImageStatusFilter.MISSING,
  })
  @IsOptional()
  @IsEnum(ProductImageStatusFilter)
  imageStatus?: ProductImageStatusFilter = ProductImageStatusFilter.MISSING;

  /** Item category id; descendants are included (A-06). */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  /** Case-insensitive "contains" on group code, group name and variant code (A-17). */
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;
}

/** One product/orphan group row of the image search. */
export class ProductImageRowDto {
  @ApiProperty({ enum: ['product', 'orphan'] })
  type!: 'product' | 'orphan';

  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, description: 'Category of the group (MIN over variants)' })
  categoryName!: string | null;

  @ApiProperty({ description: 'Number of ATTACHED images on the group' })
  imageCount!: number;

  @ApiProperty({ nullable: true, description: 'Public URL of the first image, if any' })
  thumbnailUrl!: string | null;
}

/** Paginated envelope returned by the image search. */
export class ProductImageSearchResponseDto {
  @ApiProperty({ type: [ProductImageRowDto] })
  data!: ProductImageRowDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
