import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityRegistryService } from '../../crud/entity-registry.service';
import { CashModule } from '../cash/cash.module';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { CashMovementEntity } from '../cash/cash-movement.entity';
import { CashAccountEntity } from '../cash/cash-account.entity';
import { CashReceiptEntity } from './cash-receipts/cash-receipt.entity';
import { CashReceiptLineEntity } from './cash-receipts/cash-receipt-line.entity';
import { CashPaymentEntity } from './cash-payments/cash-payment.entity';
import { CashPaymentLineEntity } from './cash-payments/cash-payment-line.entity';
import { CashCountEntity } from './cash-counts/cash-count.entity';
import { CashVoucherCategoryEntity } from './cash-voucher-categories/cash-voucher-category.entity';
import {
  CashVoucherCategoriesService,
  CASH_VOUCHER_CATEGORY_SERVICE_TOKEN,
  CASH_VOUCHER_CATEGORY_ENTITY_CONFIG,
} from './cash-voucher-categories/cash-voucher-categories.service';
import { CashVoucherCategorySeederService } from './cash-voucher-categories/cash-voucher-category.seeder';
import { PartnerResolverService } from './shared/partner-resolver.service';
import { PartnerLookupService } from './shared/partner-lookup.service';
import { PartnerLookupController } from './shared/partner-lookup.controller';
import { CashVoucherCategoryResolverService } from './shared/category-resolver.service';
import { PosCashSaleConsumer } from './cash-voucher-consumers/pos-cash-sale.consumer';
import { DebtCollectionCashConsumer } from './cash-voucher-consumers/debt-collection-cash.consumer';
import { GoodsReceiptCashConsumer } from './cash-voucher-consumers/goods-receipt-cash.consumer';
import { ExpenseCashConsumer } from './cash-voucher-consumers/expense-cash.consumer';
import { CashReceiptsService } from './cash-receipts/cash-receipts.service';
import { CashReceiptsController } from './cash-receipts/cash-receipts.controller';
import { CashPaymentsService } from './cash-payments/cash-payments.service';
import { CashPaymentsController } from './cash-payments/cash-payments.controller';
import { CashLedgerService } from './cash-ledger/cash-ledger.service';
import { CashLedgerController } from './cash-ledger/cash-ledger.controller';
import { CashCountsService } from './cash-counts/cash-counts.service';
import { CashCountsController } from './cash-counts/cash-counts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CashReceiptEntity,
      CashReceiptLineEntity,
      CashPaymentEntity,
      CashPaymentLineEntity,
      CashCountEntity,
      CashVoucherCategoryEntity,
      CashMovementEntity,
      CashAccountEntity,
    ]),
    CashModule,
    DocumentNumberingModule,
  ],
  controllers: [
    CashReceiptsController,
    CashPaymentsController,
    CashLedgerController,
    CashCountsController,
    PartnerLookupController,
  ],
  providers: [
    CashVoucherCategoriesService,
    {
      provide: CASH_VOUCHER_CATEGORY_SERVICE_TOKEN,
      useExisting: CashVoucherCategoriesService,
    },
    CashVoucherCategorySeederService,
    PartnerResolverService,
    PartnerLookupService,
    CashVoucherCategoryResolverService,
    CashReceiptsService,
    CashPaymentsService,
    CashLedgerService,
    CashCountsService,
    PosCashSaleConsumer,
    DebtCollectionCashConsumer,
    GoodsReceiptCashConsumer,
    ExpenseCashConsumer,
  ],
  exports: [
    CashVoucherCategorySeederService,
    CashReceiptsService,
    CashPaymentsService,
    CashLedgerService,
    CashCountsService,
  ],
})
export class CashVouchersModule implements OnModuleInit {
  constructor(private readonly entityRegistry: EntityRegistryService) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(
      CASH_VOUCHER_CATEGORY_ENTITY_CONFIG,
      CASH_VOUCHER_CATEGORY_SERVICE_TOKEN,
    );
  }
}
