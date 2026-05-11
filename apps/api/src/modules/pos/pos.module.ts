import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNumberingModule } from '../document-numbering/document-numbering.module';
import { StockLedgerModule } from '../inventory/ledger/stock-ledger.module';
import { AccountingModule } from '../accounting/accounting.module';
import { EventsModule } from '../events/events.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { PromotionModule } from '../promotion/promotion.module';
import { CustomerModule } from '../customer/customer.module';
import {
  PosSessionEntity,
  SaleEntity,
  SaleLineEntity,
  PaymentEntity,
  ReturnEntity,
  ReturnLineEntity,
  SessionReconciliationEntity,
  InvoiceEntity,
  InvoiceItemEntity,
  InvoicePaymentEntity,
  InvoiceDebtEntity,
  DebtPaymentEntity,
} from './entities';
import {
  PosSessionService,
  CheckoutService,
  ReturnService,
  ExchangeService,
  PosCatalogService,
} from './services';
import { InvoiceService } from './services/invoice.service';
import { CheckoutInvoiceService } from './services/checkout-invoice.service';
import { CancelInvoiceService } from './services/cancel-invoice.service';
import { InvoiceDebtService } from './services/invoice-debt.service';
import { PosController } from './pos.controller';
import { InvoiceController } from './controllers/invoice.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PosSessionEntity,
      SaleEntity,
      SaleLineEntity,
      PaymentEntity,
      ReturnEntity,
      ReturnLineEntity,
      SessionReconciliationEntity,
      InvoiceEntity,
      InvoiceItemEntity,
      InvoicePaymentEntity,
      InvoiceDebtEntity,
      DebtPaymentEntity,
    ]),
    DocumentNumberingModule,
    StockLedgerModule,
    AccountingModule,
    EventsModule,
    WebSocketModule,
    PromotionModule,
    CustomerModule,
  ],
  controllers: [PosController, InvoiceController],
  providers: [
    PosSessionService,
    CheckoutService,
    ReturnService,
    ExchangeService,
    PosCatalogService,
    InvoiceService,
    CheckoutInvoiceService,
    CancelInvoiceService,
    InvoiceDebtService,
  ],
  exports: [
    PosSessionService,
    CheckoutService,
    ReturnService,
    ExchangeService,
    InvoiceService,
    InvoiceDebtService,
  ],
})
export class PosModule {}
