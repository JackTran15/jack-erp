import { Module, OnModuleInit } from "@nestjs/common";
import { InjectDataSource, TypeOrmModule } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import { BranchModule } from "../../branch/branch.module";
import { EntityRegistryService } from "../../crud/entity-registry.service";
import { DocumentNumberingModule } from "../../document-numbering/document-numbering.module";
import { StockBalanceEntity } from "../ledger/stock-balance.entity";
import { StockLedgerModule } from "../ledger/stock-ledger.module";
import { ItemAttributeValueEntity } from "../product/item-attribute-value.entity";
import { ProductAttributeDefinitionEntity } from "../product/product-attribute-definition.entity";
import { ProductAttributeOptionEntity } from "../product/product-attribute-option.entity";
import { ProductModule } from "../product/product.module";
import {
  BRAND_ENTITY_CONFIG,
  BRAND_SERVICE_TOKEN,
  BrandCrudService,
} from "./brand-crud.service";
import { BrandEntity } from "./brand.entity";
import { InventoryLocationStockController } from "./inventory-location-stock.controller";
import { InventoryLocationStockService } from "./inventory-location-stock.service";
import { InventoryLocationController } from "./inventory-location.controller";
import { InventoryLocationService } from "./inventory-location.service";
import { ItemBarcodeEntity } from "./item-barcode.entity";
import { ItemBarcodeService } from "./item-barcode.service";
import { ItemCategoryCommissionEntity } from "./item-category-commission.entity";
import {
  INVENTORY_ITEM_CATEGORY_ENTITY_CONFIG,
  INVENTORY_ITEM_CATEGORY_SERVICE_TOKEN,
  InventoryItemCategoryCrudService,
} from "./item-category-crud.service";
import { ItemCategoryEntity } from "./item-category.entity";
import { Module, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { BranchModule } from '../../branch/branch.module';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { ProductModule } from '../product/product.module';
import { StockTransferModule } from '../transfer/stock-transfer.module';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { EntityRegistryService } from '../../crud/entity-registry.service';
import { ItemEntity } from './item.entity';
import { ItemCategoryEntity } from './item-category.entity';
import { ItemCategoryCommissionEntity } from './item-category-commission.entity';
import { ProviderEntity } from './provider.entity';
import { SupplierGroupEntity } from './supplier-group.entity';
import { ProductAttributeDefinitionEntity } from '../product/product-attribute-definition.entity';
import { ProductAttributeOptionEntity } from '../product/product-attribute-option.entity';
import { ItemAttributeValueEntity } from '../product/item-attribute-value.entity';
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
  INVENTORY_ITEM_ENTITY_CONFIG,
  INVENTORY_ITEM_SERVICE_TOKEN,
  InventoryItemCrudService,
} from "./item-crud.service";
import { ItemProviderEntity } from "./item-provider.entity";
import { ItemProviderService } from "./item-provider.service";
import { ItemStockThresholdEntity } from "./item-stock-threshold.entity";
import { ItemStockThresholdService } from "./item-stock-threshold.service";
import { ItemUnitEntity } from "./item-unit.entity";
import { ItemEntity } from "./item.entity";
import { LocationEntity } from "./location.entity";
import {
  INVENTORY_PROVIDER_ENTITY_CONFIG,
  INVENTORY_PROVIDER_SERVICE_TOKEN,
  InventoryProviderCrudService,
} from "./provider-crud.service";
import { ProviderEntity } from "./provider.entity";
import { ShowroomEntity } from "./showroom.entity";
import { ItemCostSnapshotModule } from './item-cost-snapshot.module';
import {
  INVENTORY_STORAGE_ENTITY_CONFIG,
  INVENTORY_STORAGE_SERVICE_TOKEN,
  InventoryStorageCrudService,
} from "./storage-crud.service";
import { StorageManagerAssignmentEntity } from "./storage-manager-assignment.entity";
import { StorageEntity } from "./storage.entity";
import {
  PROVIDER_GROUP_ENTITY_CONFIG,
  PROVIDER_GROUP_SERVICE_TOKEN,
  ProviderGroupCrudService,
} from "./supplier-group-crud.service";
import { SupplierGroupEntity } from "./supplier-group.entity";
import {
  UNIT_OF_MEASURE_ENTITY_CONFIG,
  UNIT_OF_MEASURE_SERVICE_TOKEN,
  UnitOfMeasureCrudService,
} from "./unit-of-measure-crud.service";
import { UnitOfMeasureEntity } from "./unit-of-measure.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemEntity,
      ItemCategoryEntity,
      ItemCategoryCommissionEntity,
      ProviderEntity,
      SupplierGroupEntity,
      UnitOfMeasureEntity,
      BrandEntity,
      ItemProviderEntity,
      ItemBarcodeEntity,
      ItemStockThresholdEntity,
      ItemUnitEntity,
      StorageEntity,
      ShowroomEntity,
      LocationEntity,
      StorageManagerAssignmentEntity,
      StockBalanceEntity,
      ProductAttributeDefinitionEntity,
      ProductAttributeOptionEntity,
      ItemAttributeValueEntity,
    ]),
    BranchModule,
    StockLedgerModule,
    ProductModule,
    StockTransferModule,
    DocumentNumberingModule,
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
    ProviderGroupCrudService,
    UnitOfMeasureCrudService,
    BrandCrudService,
    {
      provide: INVENTORY_ITEM_SERVICE_TOKEN,
      useExisting: InventoryItemCrudService,
    },
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
    {
      provide: PROVIDER_GROUP_SERVICE_TOKEN,
      useExisting: ProviderGroupCrudService,
    },
    {
      provide: UNIT_OF_MEASURE_SERVICE_TOKEN,
      useExisting: UnitOfMeasureCrudService,
    },
    {
      provide: BRAND_SERVICE_TOKEN,
      useExisting: BrandCrudService,
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
      PROVIDER_GROUP_ENTITY_CONFIG,
      PROVIDER_GROUP_SERVICE_TOKEN,
    );
    this.entityRegistry.registerEntity(
      UNIT_OF_MEASURE_ENTITY_CONFIG,
      UNIT_OF_MEASURE_SERVICE_TOKEN,
    );
    this.entityRegistry.registerEntity(
      BRAND_ENTITY_CONFIG,
      BRAND_SERVICE_TOKEN,
    );
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
