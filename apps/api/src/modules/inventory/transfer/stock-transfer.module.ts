import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { ItemCostSnapshotModule } from '../location/item-cost-snapshot.module';
import { StockTransferEntity } from './stock-transfer.entity';
import { StockTransferLineEntity } from './stock-transfer-line.entity';
import { LocationEntity } from '../location/location.entity';
import { StorageEntity } from '../location/storage.entity';
import { UserEntity } from '../../auth/user.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { StockTransferService } from './stock-transfer.service';
import { StockTransferController } from './stock-transfer.controller';
import { StockTransferV2Controller } from './controllers/stock-transfer-v2.controller';
import { StockTransferCommandV2Controller } from './controllers/stock-transfer-command-v2.controller';
import { SearchStockTransfersV2Handler } from './queries/search-stock-transfers-v2.handler';
import { CreateStockTransferV2Handler } from './commands/create-stock-transfer-v2.handler';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      StockTransferEntity,
      StockTransferLineEntity,
      LocationEntity,
      StorageEntity,
      UserEntity,
      StockBalanceEntity,
    ]),
    StockLedgerModule,
    DocumentNumberingModule,
    ItemCostSnapshotModule,
  ],
  controllers: [
    StockTransferController,
    StockTransferV2Controller,
    StockTransferCommandV2Controller,
  ],
  providers: [
    StockTransferService,
    SearchStockTransfersV2Handler,
    CreateStockTransferV2Handler,
  ],
  exports: [StockTransferService],
})
export class StockTransferModule {}
