import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchModule } from '../../branch/branch.module';
import { ItemEntity } from './item.entity';
import { StorageEntity } from './storage.entity';
import { ShowroomEntity } from './showroom.entity';
import { LocationEntity } from './location.entity';
import { StorageManagerAssignmentEntity } from './storage-manager-assignment.entity';
import { InventoryLocationService } from './inventory-location.service';
import { InventoryLocationController } from './inventory-location.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemEntity,
      StorageEntity,
      ShowroomEntity,
      LocationEntity,
      StorageManagerAssignmentEntity,
    ]),
    BranchModule,
  ],
  controllers: [InventoryLocationController],
  providers: [InventoryLocationService],
  exports: [InventoryLocationService],
})
export class InventoryLocationModule {}
