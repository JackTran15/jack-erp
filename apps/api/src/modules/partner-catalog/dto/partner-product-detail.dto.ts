import { ApiProperty } from '@nestjs/swagger';
import { PartnerProductRowDto } from './partner-product-search.dto';

/**
 * One selectable dimension of a product, e.g. Size with 35..39.
 *
 * `options` are the values as stored. For colour that means raw ERP codes
 * ("BA", "D") — this catalogue keeps short internal codes and has no display
 * name or hex value for them, so inventing one here would be fiction.
 */
export class PartnerAttributeDto {
  @ApiProperty({ description: 'Dimension name as stored, e.g. "Color" or "Size"' })
  name!: string;

  @ApiProperty({ type: [String], description: 'Selectable values, in catalogue order' })
  options!: string[];
}

/** A single buyable variant (SKU). */
export class PartnerVariantDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Variant SKU' })
  code!: string;

  @ApiProperty({
    nullable: true,
    description:
      'Pre-composed label as stored on the variant, e.g. "38 · BA". Provided as-is; ' +
      'use `attributes` when you need the parts rather than the label.',
  })
  variantLabel!: string | null;

  @ApiProperty({ description: 'Selling price of this variant, in VND' })
  price!: number;

  @ApiProperty({ description: 'Stock in any branch this API key may see' })
  inStock!: boolean;

  @ApiProperty({
    description: 'Dimension name to chosen value, e.g. { "Size": "38", "Color": "BA" }',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  attributes!: Record<string, string>;
}

/**
 * Everything the storefront's product page needs.
 *
 * Extends the listing row so a partner that already renders a listing card can
 * reuse the same field names, and adds the two things only the detail page
 * needs: the selectable dimensions, and the concrete variants behind them.
 * Both are required — `attributes` alone cannot say which combinations exist.
 */
export class PartnerProductDetailDto extends PartnerProductRowDto {
  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ type: () => [PartnerAttributeDto] })
  attributes!: PartnerAttributeDto[];

  @ApiProperty({ type: () => [PartnerVariantDto] })
  variants!: PartnerVariantDto[];
}
