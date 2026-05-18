import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { EventsModule } from '../../events/events.module';
import { GoodsReceiptEntity } from './goods-receipt.entity';
import { GoodsReceiptLineEntity } from './goods-receipt-line.entity';
import { GoodsReceiptService } from './goods-receipt.service';
import { GoodsReceiptController } from './goods-receipt.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([GoodsReceiptEntity, GoodsReceiptLineEntity]),
    StockLedgerModule,
    DocumentNumberingModule,
    EventsModule,
  ],
  controllers: [GoodsReceiptController],
  providers: [GoodsReceiptService],
  exports: [GoodsReceiptService],
})
export class GoodsReceiptModule {}
