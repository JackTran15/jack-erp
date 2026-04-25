import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { PurchaseOrderEntity } from './purchase-order.entity';
import { PurchaseOrderLineEntity } from './purchase-order-line.entity';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseOrderController } from './purchase-order.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseOrderEntity, PurchaseOrderLineEntity]),
    StockLedgerModule,
    DocumentNumberingModule,
  ],
  controllers: [PurchaseOrderController],
  providers: [PurchaseOrderService],
  exports: [PurchaseOrderService],
})
export class PurchaseOrderModule {}
