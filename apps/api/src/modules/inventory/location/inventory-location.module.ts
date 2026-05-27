import { Module, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { BranchModule } from '../../branch/branch.module';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { ProductModule } from '../product/product.module';
import { EntityRegistryService } from '../../crud/entity-registry.service';
import { ItemEntity } from './item.entity';
import { ItemCategoryEntity } from './item-category.entity';
import { ProviderEntity } from './provider.entity';
import { ItemProviderEntity } from './item-provider.entity';
import { ItemBarcodeEntity } from './item-barcode.entity';
import { ItemStockThresholdEntity } from './item-stock-threshold.entity';
import { ItemUnitEntity } from './item-unit.entity';
import { StorageEntity } from './storage.entity';
import { ShowroomEntity } from './showroom.entity';
import { LocationEntity } from './location.entity';
import { StorageManagerAssignmentEntity } from './storage-manager-assignment.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { InventoryLocationService } from './inventory-location.service';
import { ItemProviderService } from './item-provider.service';
import { ItemBarcodeService } from './item-barcode.service';
import { ItemStockThresholdService } from './item-stock-threshold.service';
import { InventoryLocationController } from './inventory-location.controller';
import { InventoryLocationStockController } from './inventory-location-stock.controller';
import { InventoryLocationStockService } from './inventory-location-stock.service';
import {
  InventoryItemCrudService,
  INVENTORY_ITEM_ENTITY_CONFIG,
  INVENTORY_ITEM_SERVICE_TOKEN,
} from './item-crud.service';
import {
  InventoryStorageCrudService,
  INVENTORY_STORAGE_ENTITY_CONFIG,
  INVENTORY_STORAGE_SERVICE_TOKEN,
} from './storage-crud.service';
import {
  InventoryProviderCrudService,
  INVENTORY_PROVIDER_ENTITY_CONFIG,
  INVENTORY_PROVIDER_SERVICE_TOKEN,
} from './provider-crud.service';
import {
  InventoryItemCategoryCrudService,
  INVENTORY_ITEM_CATEGORY_ENTITY_CONFIG,
  INVENTORY_ITEM_CATEGORY_SERVICE_TOKEN,
} from './item-category-crud.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemEntity,
      ItemCategoryEntity,
      ProviderEntity,
      ItemProviderEntity,
      ItemBarcodeEntity,
      ItemStockThresholdEntity,
      ItemUnitEntity,
      StorageEntity,
      ShowroomEntity,
      LocationEntity,
      StorageManagerAssignmentEntity,
      StockBalanceEntity,
    ]),
    BranchModule,
    StockLedgerModule,
    ProductModule,
  ],
  controllers: [InventoryLocationController, InventoryLocationStockController],
  providers: [
    InventoryLocationService,
    InventoryLocationStockService,
    ItemProviderService,
    ItemBarcodeService,
    ItemStockThresholdService,
    InventoryItemCrudService,
    InventoryItemCategoryCrudService,
    InventoryStorageCrudService,
    InventoryProviderCrudService,
    { provide: INVENTORY_ITEM_SERVICE_TOKEN, useExisting: InventoryItemCrudService },
    {
      provide: INVENTORY_STORAGE_SERVICE_TOKEN,
      useExisting: InventoryStorageCrudService,
    },
    {
      provide: INVENTORY_PROVIDER_SERVICE_TOKEN,
      useExisting: InventoryProviderCrudService,
    },
    {
      provide: INVENTORY_ITEM_CATEGORY_SERVICE_TOKEN,
      useExisting: InventoryItemCategoryCrudService,
    },
  ],
  exports: [
    InventoryLocationService,
    InventoryLocationStockService,
    ItemProviderService,
    ItemBarcodeService,
    ItemStockThresholdService,
    InventoryItemCrudService,
  ],
})
export class InventoryLocationModule implements OnModuleInit {
  constructor(
    private readonly entityRegistry: EntityRegistryService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    this.entityRegistry.registerEntity(
      INVENTORY_PROVIDER_ENTITY_CONFIG,
      INVENTORY_PROVIDER_SERVICE_TOKEN,
    );
    this.entityRegistry.registerEntity(
      INVENTORY_ITEM_CATEGORY_ENTITY_CONFIG,
      INVENTORY_ITEM_CATEGORY_SERVICE_TOKEN,
    );
    this.entityRegistry.registerEntity(
      INVENTORY_ITEM_ENTITY_CONFIG,
      INVENTORY_ITEM_SERVICE_TOKEN,
    );
    this.entityRegistry.registerEntity(
      INVENTORY_STORAGE_ENTITY_CONFIG,
      INVENTORY_STORAGE_SERVICE_TOKEN,
    );
  }
}
