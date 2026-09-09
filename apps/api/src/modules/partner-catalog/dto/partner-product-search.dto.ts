import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Sort modes offered to partners. Closed on purpose.
 *
 * "Most popular" is deliberately absent: nothing in `products` or `items`
 * counts units sold, so it could only be faked or derived from a heavy
 * `invoice_items` roll-up. Accepting the value and quietly ordering by
 * something else would be worse than rejecting it, so `sort: "popular"` is a
 * 400 rather than a surprise.
 */
export const PARTNER_PRODUCT_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
] as const;

export type PartnerProductSort = (typeof PARTNER_PRODUCT_SORTS)[number];

export const DEFAULT_PARTNER_PRODUCT_SORT: PartnerProductSort = 'newest';

/**
 * Request body for the partner product search.
 *
 * Filters are bare values (`priceFrom: 500000`), not the internal
 * `{ operator, value }` filter DTOs used by the backoffice surfaces. A partner
 * should not have to learn this ERP's operator vocabulary to list shoes, and
 * keeping the shapes apart means an internal filter change cannot silently
 * alter a published contract.
 *
 * The global ValidationPipe runs with `forbidNonWhitelisted: true`, so any
 * field not declared here is a 400 rather than a silent no-op.
 */
export class PartnerProductSearchDto {
  @ApiPropertyOptional({
    description: 'Free text matched against product name, product code and variant SKU',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  @ApiPropertyOptional({
    description:
      'Category id. Matches products in this category AND in every category below it, ' +
      'so a top-level menu entry returns the whole branch.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Minimum variant selling price, inclusive', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceFrom?: number;

  @ApiPropertyOptional({ description: 'Maximum variant selling price, inclusive', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceTo?: number;

  @ApiPropertyOptional({
    description:
      'Raw ERP colour codes (e.g. "BA", "D"), not display names — this catalogue stores ' +
      'short internal codes and has no colour name or hex value. Combined with `sizes` ' +
      'the match must come from the SAME variant.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  colors?: string[];

  @ApiPropertyOptional({
    description: 'Size values as stored (e.g. "38", "39").',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  sizes?: string[];

  @ApiPropertyOptional({
    enum: PARTNER_PRODUCT_SORTS,
    default: DEFAULT_PARTNER_PRODUCT_SORT,
  })
  @IsOptional()
  @IsIn(PARTNER_PRODUCT_SORTS as readonly string[])
  sort?: PartnerProductSort = DEFAULT_PARTNER_PRODUCT_SORT;

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
}

/**
 * One product in the partner listing.
 *
 * Price is a range, not a number: this ERP stores the selling price on the
 * variant (`items.selling_price`), never on the product, so a product with
 * several variants genuinely has several prices.
 */
export class PartnerProductRowDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true, description: 'Product code, null when unset' })
  code!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  categoryId!: string | null;

  @ApiProperty({ nullable: true })
  categoryName!: string | null;

  @ApiProperty({ description: 'Cheapest active variant, in VND' })
  priceMin!: number;

  @ApiProperty({ description: 'Dearest active variant, in VND' })
  priceMax!: number;

  @ApiProperty({
    type: [String],
    description: 'Raw ERP colour codes across active variants',
  })
  colors!: string[];

  @ApiProperty({ type: [String], description: 'Size values across active variants' })
  sizes!: string[];

  @ApiProperty({
    description:
      'True when any active variant has stock in any branch this API key may see. ' +
      'Quantities are never exposed.',
  })
  inStock!: boolean;

  @ApiProperty({
    type: [String],
    description:
      'Always empty. This ERP has no image storage yet; the field is part of the ' +
      'contract so images can appear later without a breaking change.',
  })
  images!: string[];
}

export class PartnerProductSearchResponseDto {
  @ApiProperty({ type: () => [PartnerProductRowDto] })
  data!: PartnerProductRowDto[];

  @ApiProperty({ description: 'Total matching products, not the size of this page' })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
