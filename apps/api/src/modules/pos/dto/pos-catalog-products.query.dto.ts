import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../crud/dto/pagination-query.dto';
import { PosCatalogDirection } from './pos-catalog.query.dto';

/** Discriminator for a catalog card: a parent product or a standalone item. */
export type PosProductKind = 'PRODUCT' | 'ITEM';

/** Query for the product-level POS catalog list. */
export class PosCatalogProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: PosCatalogDirection,
    description: 'Restrict the branch stock used for aggregation to warehouse or showroom locations.',
  })
  @IsOptional()
  @IsEnum(PosCatalogDirection)
  direction?: PosCatalogDirection;
}

/** Query for the product-level POS catalog detail. */
export class PosCatalogProductDetailQueryDto {
  @ApiPropertyOptional({
    enum: ['PRODUCT', 'ITEM'],
    description: 'Hint from the list row to skip product/item resolution. Omit to auto-resolve.',
  })
  @IsOptional()
  @IsIn(['PRODUCT', 'ITEM'])
  kind?: PosProductKind;
}
