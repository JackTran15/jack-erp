import { forwardRef, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { BranchEntity } from '../../branch/branch.entity';
import { GoodsIssueModule } from '../goods-issue/goods-issue.module';
import { GoodsReceiptModule } from '../goods-receipt/goods-receipt.module';
import { LocationEntity } from '../location/location.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { GoodsIssueEntity } from '../goods-issue/goods-issue.entity';
import { GoodsReceiptEntity } from '../goods-receipt/goods-receipt.entity';
import { StorageEntity } from '../location/storage.entity';
import { TransferOrderEntity } from './transfer-order.entity';
import { TransferOrderLineEntity } from './transfer-order-line.entity';
import { TransferOrderService } from './transfer-order.service';
import { TransferOrderController } from './transfer-order.controller';
import { TransferOrderV2Controller } from './controllers/transfer-order-v2.controller';
import { SearchTransferOrderLinesV2Handler } from './queries/search-transfer-order-lines-v2.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransferOrderEntity,
      TransferOrderLineEntity,
      LocationEntity,
      StockBalanceEntity,
      GoodsIssueEntity,
      GoodsReceiptEntity,
      BranchEntity,
      StorageEntity,
    ]),
    CqrsModule,
    DocumentNumberingModule,
    forwardRef(() => GoodsIssueModule),
    forwardRef(() => GoodsReceiptModule),
  ],
  controllers: [TransferOrderController, TransferOrderV2Controller],
  providers: [TransferOrderService, SearchTransferOrderLinesV2Handler],
  exports: [TransferOrderService],
})
export class TransferOrderModule {}
