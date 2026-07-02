import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { BranchEntity } from '../../branch/branch.entity';
import { GoodsIssueModule } from '../goods-issue/goods-issue.module';
import { GoodsReceiptModule } from '../goods-receipt/goods-receipt.module';
import { LocationEntity } from '../location/location.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { GoodsIssueEntity } from '../goods-issue/goods-issue.entity';
import { StorageEntity } from '../location/storage.entity';
import { TransferOrderEntity } from './transfer-order.entity';
import { TransferOrderLineEntity } from './transfer-order-line.entity';
import { TransferOrderService } from './transfer-order.service';
import { TransferOrderController } from './transfer-order.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransferOrderEntity,
      TransferOrderLineEntity,
      LocationEntity,
      StockBalanceEntity,
      GoodsIssueEntity,
      BranchEntity,
      StorageEntity,
    ]),
    DocumentNumberingModule,
    forwardRef(() => GoodsIssueModule),
    GoodsReceiptModule,
  ],
  controllers: [TransferOrderController],
  providers: [TransferOrderService],
  exports: [TransferOrderService],
})
export class TransferOrderModule {}
