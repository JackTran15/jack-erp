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
  SessionReconciliationEntity,
  InvoiceEntity,
  InvoiceItemEntity,
  InvoicePaymentEntity,
  InvoiceDebtEntity,
  DebtPaymentEntity,
} from './entities';
import { CashAccountEntity } from '../accounting/cash/cash-account.entity';
import { CashMovementEntity } from '../accounting/cash/cash-movement.entity';
import {
  PosSessionService,
  PosCatalogService,
} from './services';
import { InvoiceService } from './services/invoice.service';
import { CheckoutInvoiceService } from './services/checkout-invoice.service';
import { CancelInvoiceService } from './services/cancel-invoice.service';
import { InvoiceDebtService } from './services/invoice-debt.service';
import { ReturnEligibilityService } from './services/return-eligibility.service';
import { CreateReturnInvoiceService } from './services/create-return-invoice.service';
import { CreateExchangeInvoiceService } from './services/create-exchange-invoice.service';
import { CheckoutReturnService } from './services/checkout-return.service';
import { PosController } from './pos.controller';
import { InvoiceController } from './controllers/invoice.controller';
import { InvoiceCancelledPublisher } from './publishers/invoice-cancelled.publisher';
import { ReturnPostedPublisher } from './publishers/return-posted.publisher';
import { StockReturnInPublisher } from './publishers/stock-return-in.publisher';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PosSessionEntity,
      SessionReconciliationEntity,
      InvoiceEntity,
      InvoiceItemEntity,
      InvoicePaymentEntity,
      InvoiceDebtEntity,
      DebtPaymentEntity,
      CashAccountEntity,
      CashMovementEntity,
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
    PosCatalogService,
    InvoiceService,
    CheckoutInvoiceService,
    CancelInvoiceService,
    InvoiceDebtService,
    InvoiceCancelledPublisher,
    ReturnPostedPublisher,
    StockReturnInPublisher,
    ReturnEligibilityService,
    CreateReturnInvoiceService,
    CreateExchangeInvoiceService,
    CheckoutReturnService,
  ],
  exports: [
    PosSessionService,
    InvoiceService,
    InvoiceDebtService,
    ReturnEligibilityService,
  ],
})
export class PosModule {}
