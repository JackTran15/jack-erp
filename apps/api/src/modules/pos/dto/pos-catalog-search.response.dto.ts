import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** A location holding stock of an item at the branch. */
export class PosCatalogLocationDto {
  @ApiProperty({ format: 'uuid' }) locationId: string;
  @ApiProperty() name: string;
  @ApiProperty() quantity: number;
}

/** Full catalogue line — mirrors PosCatalogLineDto from PosCatalogService. */
export class PosCatalogLineResponseDto {
  @ApiProperty({ format: 'uuid' }) itemId: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Parent product grouping the variants; null for a standalone item.',
  })
  productId: string | null;

  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() unit: string;
  @ApiProperty() sellingPrice: number;

  @ApiProperty({ description: 'Total on-hand at the branch, across every storage location.' })
  quantityOnHand: number;

  @ApiProperty({
    description:
      'Projected showroom on-hand once every open temp-warehouse line lands. This, not quantityOnHand, is the oversell-warning basis.',
  })
  sellableQuantity: number;

  @ApiProperty({ type: [PosCatalogLocationDto] })
  locations: PosCatalogLocationDto[];

  @ApiProperty({ description: 'Location a POS sale deducts from first; empty when the branch holds no stock.' })
  defaultLocationId: string;
}

/**
 * Trimmed line for the POS suggestion dropdown (`view=suggest`).
 *
 * Drops `locations[]` — which nothing on the checkout path reads, and which is
 * the bulk of the payload — and `quantityOnHand`. Keeps `sellableQuantity`:
 * it is the oversell-warning basis, and the cashier adds straight from this
 * dropdown into the cart.
 */
export class PosCatalogSuggestionDto {
  @ApiProperty({ format: 'uuid' }) itemId: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) productId: string | null;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() unit: string;
  @ApiProperty() sellingPrice: number;
  @ApiProperty() sellableQuantity: number;
  @ApiProperty() defaultLocationId: string;
}

/** Response of GET /pos/branches/:branchId/catalog/search. */
export class PosCatalogSearchResponseDto {
  @ApiPropertyOptional({
    type: PosCatalogLineResponseDto,
    nullable: true,
    description:
      'The item whose SKU or barcode equals the term exactly — only when exactly one matches, so the caller can auto-add without counting. Null for zero or several matches.',
  })
  exact: PosCatalogLineResponseDto | null;

  @ApiProperty({
    type: [PosCatalogSuggestionDto],
    description:
      'Fuzzy matches for the dropdown, capped by `limit`. Carries locations[] and quantityOnHand as well when view=full. Always empty when mode=exact.',
  })
  suggestions: PosCatalogSuggestionDto[] | PosCatalogLineResponseDto[];
}
