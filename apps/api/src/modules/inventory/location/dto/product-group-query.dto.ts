import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsString, IsIn, IsUUID, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';

function parseBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const v = String(value).toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}

export class ProductGroupsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @ApiPropertyOptional({ description: 'Ignored — results are always sorted by code ASC' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Chỉ lấy hàng đang theo dõi (is_active). Bỏ trống = lấy tất cả.',
  })
  @IsOptional()
  @Transform(({ value }) => parseBool(value))
  @IsBoolean()
  isActive?: boolean;
}

export class ProductItemsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional({
    description: 'Chỉ lấy hàng đang theo dõi (is_active). Bỏ trống = lấy tất cả.',
  })
  @IsOptional()
  @Transform(({ value }) => parseBool(value))
  @IsBoolean()
  isActive?: boolean;
}

export interface ProductGroupRow {
  type: 'product' | 'orphan';
  id: string;
  code: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  brand: string | null;
  itemType: string | null;
  isPosVisible: boolean;
  isActive: boolean;
  itemCount: number;
}

export interface ProductVariantRow {
  id: string;
  code: string;
  name: string;
  variantLabel: string | null;
  categoryId: string | null;
  categoryName: string | null;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  brand: string | null;
  itemType: string | null;
  isPosVisible: boolean;
  isActive: boolean;
}
