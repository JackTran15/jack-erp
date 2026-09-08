import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsUUID,
} from 'class-validator';

/**
 * Upper bound on how many items one call may ask about. A POS cart never comes
 * close; the cap exists so a broken client cannot turn this into a table scan.
 */
export const POS_CATALOG_STOCK_MAX_ITEMS = 200;

/** Body of POST /pos/branches/:branchId/catalog/stock. */
export class PosCatalogStockQueryDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Items to report branch stock for. Rejected when empty: the caller is expected to skip the request entirely rather than ask about nothing.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(POS_CATALOG_STOCK_MAX_ITEMS)
  @IsUUID('4', { each: true })
  itemIds: string[];
}
