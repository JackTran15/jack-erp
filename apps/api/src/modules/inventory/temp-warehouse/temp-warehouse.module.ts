import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TempWarehouseSessionEntity } from './temp-warehouse-session.entity';
import { TempWarehouseLineEntity } from './temp-warehouse-line.entity';
import { StorageEntity } from '../location/storage.entity';
import { ShowroomEntity } from '../location/showroom.entity';
import { LocationEntity } from '../location/location.entity';
import { ItemEntity } from '../location/item.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { UserEntity } from '../../auth/user.entity';
import { UserBranchAssignmentEntity } from '../../branch/user-branch-assignment.entity';
import { TempWarehouseService } from './temp-warehouse.service';
import { TempWarehouseController } from './temp-warehouse.controller';
import { BranchLocationResolverService } from './branch-location-resolver.service';
import { TempWarehouseTransferConsumer } from './consumers/temp-warehouse-transfer.consumer';
import { TempWarehouseTransferMaterializerService } from './temp-warehouse-transfer-materializer.service';
import { StockTransferModule } from '../transfer/stock-transfer.module';
import { InventoryLocationModule } from '../location/inventory-location.module';
import { EventsModule } from '../../events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TempWarehouseSessionEntity,
      TempWarehouseLineEntity,
      StorageEntity,
      ShowroomEntity,
      LocationEntity,
      ItemEntity,
      StockBalanceEntity,
      UserEntity,
      UserBranchAssignmentEntity,
    ]),
    StockTransferModule,
    InventoryLocationModule,
    EventsModule,
  ],
  controllers: [TempWarehouseController],
  providers: [
    TempWarehouseService,
    BranchLocationResolverService,
    TempWarehouseTransferMaterializerService,
    TempWarehouseTransferConsumer,
  ],
  exports: [TempWarehouseService],
})
export class TempWarehouseModule {}
