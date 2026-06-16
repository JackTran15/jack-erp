import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityRegistryService } from '../../crud/entity-registry.service';
import { ProductEntity } from './product.entity';
import { ProductAttributeDefinitionEntity } from './product-attribute-definition.entity';
import { ProductAttributeOptionEntity } from './product-attribute-option.entity';
import { ItemAttributeValueEntity } from './item-attribute-value.entity';
import { ItemStorageLocationEntity } from './item-storage-location.entity';
import { ItemEntity } from '../location/item.entity';
import { ItemProviderEntity } from '../location/item-provider.entity';
import { ProductCrudService, PRODUCT_ENTITY_CONFIG, PRODUCT_SERVICE_TOKEN } from './product-crud.service';
import { ProductAttributeService } from './product-attribute.service';
import { VariantGenerationService } from './variant-generation.service';
import { ItemStorageLocationService } from './item-storage-location.service';
import { LocationEntity } from '../location/location.entity';
import { ProductController } from './product.controller';
import { ProductAttributeController } from './product-attribute.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductEntity,
      ProductAttributeDefinitionEntity,
      ProductAttributeOptionEntity,
      ItemAttributeValueEntity,
      ItemStorageLocationEntity,
      ItemEntity,
      ItemProviderEntity,
      LocationEntity,
    ]),
  ],
  controllers: [ProductController, ProductAttributeController],
  providers: [
    ProductCrudService,
    ProductAttributeService,
    VariantGenerationService,
    ItemStorageLocationService,
    {
      provide: PRODUCT_SERVICE_TOKEN,
      useExisting: ProductCrudService,
    },
  ],
  exports: [ProductCrudService, ProductAttributeService, VariantGenerationService, ItemStorageLocationService],
})
export class ProductModule implements OnModuleInit {
  constructor(private readonly entityRegistry: EntityRegistryService) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(
      PRODUCT_ENTITY_CONFIG,
      PRODUCT_SERVICE_TOKEN,
    );
  }
}
