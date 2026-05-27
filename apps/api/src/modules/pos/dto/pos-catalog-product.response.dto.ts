import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PosProductKind } from './pos-catalog-products.query.dto';

/** One catalog card at the product level: a parent product (grouping its variants) or a standalone item. */
export class PosProductCardDto {
  @ApiProperty({
    enum: ['PRODUCT', 'ITEM'],
    description: 'PRODUCT = parent product grouping variants; ITEM = standalone item without a parent product.',
  })
  kind: PosProductKind;

  @ApiProperty({
    format: 'uuid',
    description: 'Product id when kind=PRODUCT, otherwise the standalone item id.',
  })
  id: string;

  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) description: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) categoryId: string | null;
  @ApiPropertyOptional({ nullable: true }) categoryName: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Image URL placeholder — always null until image storage is implemented.',
  })
  imageUrl: string | null;

  @ApiProperty({ description: 'Lowest selling price among the visible variants.' })
  minPrice: number;

  @ApiProperty({ description: 'Highest selling price among the visible variants.' })
  maxPrice: number;

  @ApiProperty({ description: 'Unit of measure of the representative variant.' })
  unit: string;

  @ApiProperty({ description: 'Number of visible variants (1 for a standalone item).' })
  variantCount: number;

  @ApiProperty({ description: 'Total on-hand quantity at the branch across all variants and locations.' })
  quantityOnHand: number;
}

/** Paginated product-level catalog list. */
export class PosProductListResponseDto {
  @ApiProperty({ type: [PosProductCardDto] }) data: PosProductCardDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

/** A location holding stock of a variant at the branch. */
export class PosVariantLocationDto {
  @ApiProperty({ format: 'uuid' }) locationId: string;
  @ApiProperty() name: string;
  @ApiProperty() quantity: number;
}

/** A resolved attribute value of a variant (e.g. { name: "Size", value: "39" }). */
export class PosVariantAttributeDto {
  @ApiProperty() name: string;
  @ApiProperty() value: string;
}

/** A sellable variant (SKU) with its branch stock. */
export class PosProductVariantDto {
  @ApiProperty({ format: 'uuid' }) itemId: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) variantLabel: string | null;
  @ApiProperty() unit: string;
  @ApiProperty() sellingPrice: number;
  @ApiPropertyOptional({ nullable: true }) imageUrl: string | null;
  @ApiProperty({ type: [PosVariantAttributeDto] }) attributes: PosVariantAttributeDto[];
  @ApiProperty({ description: 'Total on-hand quantity of this variant at the branch.' })
  quantityOnHand: number;
  @ApiProperty({ type: [PosVariantLocationDto] }) locations: PosVariantLocationDto[];
}

/** An attribute dimension of a product and its available option labels. */
export class PosProductAttributeDto {
  @ApiProperty() name: string;
  @ApiProperty({ type: [String] }) options: string[];
}

/** Product detail with its variants and branch stock. */
export class PosProductDetailDto {
  @ApiProperty({ enum: ['PRODUCT', 'ITEM'] }) kind: PosProductKind;
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) description: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) categoryId: string | null;
  @ApiPropertyOptional({ nullable: true }) categoryName: string | null;
  @ApiPropertyOptional({ nullable: true }) imageUrl: string | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty() minPrice: number;
  @ApiProperty() maxPrice: number;
  @ApiProperty({
    type: [PosProductAttributeDto],
    description: 'Variant dimensions of the product (empty for a standalone item).',
  })
  attributes: PosProductAttributeDto[];
  @ApiProperty({ type: [PosProductVariantDto] }) variants: PosProductVariantDto[];
}
