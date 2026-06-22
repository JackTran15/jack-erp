import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
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
import { GoodsReceiptV2Controller } from './controllers/goods-receipt-v2.controller';
import { GoodsReceiptCommandV2Controller } from './controllers/goods-receipt-command-v2.controller';
import { SearchGoodsReceiptsV2Handler } from './queries/search-goods-receipts-v2.handler';
import { CreateGoodsReceiptV2Handler } from './commands/create-goods-receipt-v2.handler';
import { PostGoodsReceiptV2Handler } from './commands/post-goods-receipt-v2.handler';
import { GoodsReceiptVoucherLinkConsumer } from './consumers/goods-receipt-voucher-link.consumer';

@Module({
  imports: [
    CqrsModule,
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
  controllers: [
    GoodsReceiptController,
    GoodsReceiptV2Controller,
    GoodsReceiptCommandV2Controller,
  ],
  providers: [
    GoodsReceiptService,
    SearchGoodsReceiptsV2Handler,
    CreateGoodsReceiptV2Handler,
    PostGoodsReceiptV2Handler,
    GoodsReceiptVoucherLinkConsumer,
  ],
  exports: [GoodsReceiptService],
})
export class GoodsReceiptModule {}
