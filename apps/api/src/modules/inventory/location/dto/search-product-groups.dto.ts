import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class SearchProductGroupsDto {
  @ApiPropertyOptional({ description: 'Match on model (product code or name)' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: 'Restrict to products with a variant in this category' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'When set, each variant carries on-hand quantity for this branch' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20, description: 'Page size in number of models (products)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;
}

export class ProductGroupVariantDto {
  @ApiProperty()
  itemId: string;

  @ApiProperty({ description: 'Variant SKU (Mã SKU)' })
  sku: string;

  @ApiProperty({ description: 'Comma-joined barcodes of the variant ("" if none)' })
  barcode: string;

  @ApiProperty({ description: 'Variant name (Tên hàng hoá)' })
  name: string;

  @ApiProperty()
  unit: string;

  @ApiProperty({ description: 'On-hand quantity in the requested branch (0 when branchId omitted)' })
  quantityOnHand: number;
}

export class ProductGroupProductDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ nullable: true, description: 'Model SKU (Mã SKU mẫu mã)' })
  code: string | null;

  @ApiProperty({ description: 'Model name (Tên mẫu mã)' })
  name: string;

  @ApiProperty({ type: [ProductGroupVariantDto] })
  variants: ProductGroupVariantDto[];
}

export class ProductGroupCategoryDto {
  @ApiProperty({ nullable: true })
  id: string | null;

  @ApiProperty()
  name: string;
}

export class ProductGroupNodeDto {
  @ApiProperty({ type: ProductGroupCategoryDto })
  category: ProductGroupCategoryDto;

  @ApiProperty({ type: [ProductGroupProductDto] })
  products: ProductGroupProductDto[];
}

export class SearchProductGroupsResponseDto {
  @ApiProperty({ type: [ProductGroupNodeDto] })
  data: ProductGroupNodeDto[];

  @ApiProperty({ description: 'Total matched models (products)' })
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}
