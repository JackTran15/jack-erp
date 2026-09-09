import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockBalanceEntity } from '../inventory/ledger/stock-balance.entity';
import { ItemCategoryEntity } from '../inventory/location/item-category.entity';
import { ItemEntity } from '../inventory/location/item.entity';
import { ItemAttributeValueEntity } from '../inventory/product/item-attribute-value.entity';
import { ProductAttributeDefinitionEntity } from '../inventory/product/product-attribute-definition.entity';
import { ProductAttributeOptionEntity } from '../inventory/product/product-attribute-option.entity';
import { ProductEntity } from '../inventory/product/product.entity';
import { PartnerCategoryV2Controller } from './controllers/partner-category-v2.controller';
import { PartnerProductV2Controller } from './controllers/partner-product-v2.controller';
import { SearchPartnerCategoriesHandler } from './queries/search-partner-categories.handler';
import { SearchPartnerProductsHandler } from './queries/search-partner-products.handler';

/**
 * Read-only catalogue surface for third-party partners (storefronts).
 *
 * Owns no entity and runs no migration: it reads the inventory tables and
 * projects them onto DTOs that deliberately exclude purchase price and every
 * other internal field. The shared inventory endpoints cannot be reused for
 * this, because `InventoryItemGroupRowDto` returns `purchasePrice` and is also
 * consumed by the backoffice — see ADR-01.
 *
 * Authentication needs nothing here: the global `AuthGuard` already accepts an
 * `X-Api-Key` header alongside a JWT. Controllers in this module must therefore
 * never carry `@Public()`; they authorise through `PermissionGuard` with
 * `PARTNER_CATALOG_PERMISSION`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemCategoryEntity,
      ProductEntity,
      ItemEntity,
      StockBalanceEntity,
      ProductAttributeDefinitionEntity,
      ProductAttributeOptionEntity,
      ItemAttributeValueEntity,
    ]),
    CqrsModule,
  ],
  // PartnerProductV2Controller carries the static products/search route and
  // will later carry products/:productId; keep it registered after the
  // category controller and keep its static route first inside the class.
  controllers: [PartnerCategoryV2Controller, PartnerProductV2Controller],
  providers: [SearchPartnerCategoriesHandler, SearchPartnerProductsHandler],
})
export class PartnerCatalogModule {}
