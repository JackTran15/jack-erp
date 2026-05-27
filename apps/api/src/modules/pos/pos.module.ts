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
import { LocationEntity } from '../inventory/location/location.entity';
import { CustomerEntity } from '../customer/customer.entity';
import { ItemEntity } from '../inventory/location/item.entity';
import { ShowroomEntity } from '../inventory/location/showroom.entity';
import { ProductEntity } from '../inventory/product/product.entity';
import { ProductAttributeDefinitionEntity } from '../inventory/product/product-attribute-definition.entity';
import { ItemAttributeValueEntity } from '../inventory/product/item-attribute-value.entity';
import { StockBalanceEntity } from '../inventory/ledger/stock-balance.entity';
import {
  PosSessionService,
  PosCatalogService,
  PosCatalogProductService,
} from './services';
import { InvoiceService } from './services/invoice.service';
import { CheckoutInvoiceService } from './services/checkout-invoice.service';
import { CancelInvoiceService } from './services/cancel-invoice.service';
import { InvoiceDebtService } from './services/invoice-debt.service';
import { ReturnEligibilityService } from './services/return-eligibility.service';
import { CreateReturnInvoiceService } from './services/create-return-invoice.service';
import { CreateExchangeInvoiceService } from './services/create-exchange-invoice.service';
import { CheckoutReturnService } from './services/checkout-return.service';
import { PointsRedemptionService } from './services/points-redemption.service';
import { PosController } from './pos.controller';
import { InvoiceController } from './controllers/invoice.controller';
import { InvoiceCancelledPublisher } from './publishers/invoice-cancelled.publisher';
import { DebtPaymentVoucherLinkConsumer } from './consumers/debt-payment-voucher-link.consumer';
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
      LocationEntity,
      CustomerEntity,
      ItemEntity,
      ShowroomEntity,
      ProductEntity,
      ProductAttributeDefinitionEntity,
      ItemAttributeValueEntity,
      StockBalanceEntity,
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
    PosCatalogProductService,
    InvoiceService,
    CheckoutInvoiceService,
    CancelInvoiceService,
    InvoiceDebtService,
    InvoiceCancelledPublisher,
    DebtPaymentVoucherLinkConsumer,
    ReturnPostedPublisher,
    StockReturnInPublisher,
    ReturnEligibilityService,
    CreateReturnInvoiceService,
    CreateExchangeInvoiceService,
    CheckoutReturnService,
    PointsRedemptionService,
  ],
  exports: [
    PosSessionService,
    InvoiceService,
    InvoiceDebtService,
    ReturnEligibilityService,
  ],
})
export class PosModule {}
