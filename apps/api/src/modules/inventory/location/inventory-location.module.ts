import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchModule } from '../../branch/branch.module';
import { EntityRegistryService } from '../../crud/entity-registry.service';
import { ItemEntity } from './item.entity';
import { ProviderEntity } from './provider.entity';
import { StorageEntity } from './storage.entity';
import { ShowroomEntity } from './showroom.entity';
import { LocationEntity } from './location.entity';
import { StorageManagerAssignmentEntity } from './storage-manager-assignment.entity';
import { InventoryLocationService } from './inventory-location.service';
import { InventoryLocationController } from './inventory-location.controller';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemEntity,
      ProviderEntity,
      StorageEntity,
      ShowroomEntity,
      LocationEntity,
      StorageManagerAssignmentEntity,
    ]),
    BranchModule,
  ],
  controllers: [InventoryLocationController],
  providers: [
    InventoryLocationService,
    InventoryItemCrudService,
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
  ],
  exports: [InventoryLocationService],
})
export class InventoryLocationModule implements OnModuleInit {
  constructor(private readonly entityRegistry: EntityRegistryService) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(
      INVENTORY_PROVIDER_ENTITY_CONFIG,
      INVENTORY_PROVIDER_SERVICE_TOKEN,
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
