import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLedgerModule } from '../ledger/stock-ledger.module';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { EventsModule } from '../../events/events.module';
import { CashModule } from '../../accounting/cash/cash.module';
import { JournalModule } from '../../accounting/journal/journal.module';
import { GoodsReceiptEntity } from './goods-receipt.entity';
import { GoodsReceiptLineEntity } from './goods-receipt-line.entity';
import { SupplierDebtEntity } from '../supplier-debt/supplier-debt.entity';
import { SupplierDebtPaymentEntity } from '../supplier-debt/supplier-debt-payment.entity';
import { GoodsReceiptService } from './goods-receipt.service';
import { GoodsReceiptController } from './goods-receipt.controller';
import { GoodsReceiptVoucherLinkConsumer } from './consumers/goods-receipt-voucher-link.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GoodsReceiptEntity,
      GoodsReceiptLineEntity,
      SupplierDebtEntity,
      SupplierDebtPaymentEntity,
    ]),
    StockLedgerModule,
    DocumentNumberingModule,
    EventsModule,
    CashModule,
    JournalModule,
  ],
  controllers: [GoodsReceiptController],
  providers: [GoodsReceiptService, GoodsReceiptVoucherLinkConsumer],
  exports: [GoodsReceiptService],
})
export class GoodsReceiptModule {}
