import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { GoodsReceiptEntity } from '../goods-receipt/goods-receipt.entity';
import { GoodsReceiptLineEntity } from '../goods-receipt/goods-receipt-line.entity';
import { GoodsIssueEntity } from '../goods-issue/goods-issue.entity';
import { GoodsIssueLineEntity } from '../goods-issue/goods-issue-line.entity';
import { LocationEntity } from '../location/location.entity';
import { ItemCostSnapshotModule } from '../location/item-cost-snapshot.module';
import { StockTakeEntity } from './stock-take.entity';
import { StockTakeLineEntity } from './stock-take-line.entity';
import { StockTakeService } from './stock-take.service';
import { StockTakeController } from './stock-take.controller';
import { StockTakeV2Controller } from './controllers/stock-take-v2.controller';
import { SearchStockTakesV2Handler } from './queries/search-stock-takes-v2.handler';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      StockTakeEntity,
      StockTakeLineEntity,
      StockBalanceEntity,
      LocationEntity,
      GoodsReceiptEntity,
      GoodsReceiptLineEntity,
      GoodsIssueEntity,
      GoodsIssueLineEntity,
    ]),
    StockLedgerModule,
    DocumentNumberingModule,
    ItemCostSnapshotModule,
  ],
  controllers: [StockTakeController, StockTakeV2Controller],
  providers: [StockTakeService, SearchStockTakesV2Handler],
  exports: [StockTakeService],
})
export class StockTakeModule {}
