import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Result of an item lookup by code (SKU or barcode) for the barcode-scan field
 * on the goods receipt/issue/transfer forms. Shape mirrors the core of the item
 * returned by the picker (ProductSelectDialog) so the form can reuse its add-row
 * path; the location is resolved separately.
 */
export class ItemLookupResultDto {
  @ApiProperty({ format: 'uuid' }) itemId: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) productId: string | null;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() unit: string;
  @ApiProperty() purchasePrice: number;
  @ApiProperty() sellingPrice: number;
  @ApiPropertyOptional({ nullable: true }) variantLabel: string | null;
  @ApiPropertyOptional({ nullable: true }) categoryName: string | null;
}
