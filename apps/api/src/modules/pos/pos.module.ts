import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
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
import { CashReceiptEntity } from '../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import { BranchEntity } from '../branch/branch.entity';
import { LocationEntity } from '../inventory/location/location.entity';
import { CustomerEntity } from '../customer/customer.entity';
import { ItemEntity } from '../inventory/location/item.entity';
import { ItemCategoryEntity } from '../inventory/location/item-category.entity';
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
import { OverdueDebtsService } from './services/overdue-debts.service';
import { ReturnEligibilityService } from './services/return-eligibility.service';
import { CreateReturnInvoiceService } from './services/create-return-invoice.service';
import { CreateExchangeInvoiceService } from './services/create-exchange-invoice.service';
import { CheckoutReturnService } from './services/checkout-return.service';
import { PointsRedemptionService } from './services/points-redemption.service';
import { PosController } from './pos.controller';
import { InvoiceController } from './controllers/invoice.controller';
import { InvoiceV2Controller } from './controllers/invoice-v2.controller';
import { ReturnableInvoiceV2Controller } from './controllers/returnable-invoice-v2.controller';
import { PurchaseHistoryV2Controller } from './controllers/purchase-history-v2.controller';
import { DraftInvoiceV2Controller } from './controllers/draft-invoice-v2.controller';
import { SearchInvoicesV2Handler } from './queries/search-invoices-v2.handler';
import { SearchReturnableInvoicesV2Handler } from './queries/search-returnable-invoices-v2.handler';
import { SearchPurchaseHistoryV2Handler } from './queries/search-purchase-history-v2.handler';
import { SearchDraftInvoicesV2Handler } from './queries/search-draft-invoices-v2.handler';
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
      CashReceiptEntity,
      BranchEntity,
      LocationEntity,
      CustomerEntity,
      ItemEntity,
      ItemCategoryEntity,
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
    CqrsModule,
  ],
  controllers: [
    PosController,
    InvoiceController,
    InvoiceV2Controller,
    ReturnableInvoiceV2Controller,
    PurchaseHistoryV2Controller,
    DraftInvoiceV2Controller,
  ],
  providers: [
    PosSessionService,
    PosCatalogService,
    PosCatalogProductService,
    InvoiceService,
    CheckoutInvoiceService,
    CancelInvoiceService,
    InvoiceDebtService,
    OverdueDebtsService,
    InvoiceCancelledPublisher,
    DebtPaymentVoucherLinkConsumer,
    ReturnPostedPublisher,
    StockReturnInPublisher,
    ReturnEligibilityService,
    CreateReturnInvoiceService,
    CreateExchangeInvoiceService,
    CheckoutReturnService,
    PointsRedemptionService,
    SearchInvoicesV2Handler,
    SearchReturnableInvoicesV2Handler,
    SearchPurchaseHistoryV2Handler,
    SearchDraftInvoicesV2Handler,
  ],
  exports: [
    PosSessionService,
    InvoiceService,
    InvoiceDebtService,
    ReturnEligibilityService,
  ],
})
export class PosModule {}
