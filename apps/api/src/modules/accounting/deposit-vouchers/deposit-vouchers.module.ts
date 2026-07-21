import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { DepositModule } from '../deposit/deposit.module';
import { DepositAccountEntity } from '../deposit/deposit-account.entity';
import { BankEntity } from '../deposit/bank.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { PaymentAccountsModule } from '../payment-accounts/payment-accounts.module';
import { CashModule } from '../cash/cash.module';
import { CashVouchersModule } from '../cash-vouchers/cash-vouchers.module';
import { PartnerResolverService } from '../cash-vouchers/shared/partner-resolver.service';
import { BankReceiptEntity } from './bank-receipts/bank-receipt.entity';
import { BankReceiptLineEntity } from './bank-receipts/bank-receipt-line.entity';
import { BankPaymentEntity } from './bank-payments/bank-payment.entity';
import { BankPaymentLineEntity } from './bank-payments/bank-payment-line.entity';
import { BankReceiptsService } from './bank-receipts/bank-receipts.service';
import { BankReceiptsController } from './bank-receipts/bank-receipts.controller';
import { BankPaymentsService } from './bank-payments/bank-payments.service';
import { BankPaymentsController } from './bank-payments/bank-payments.controller';
import { SupplierDepositPaymentSagaEntity } from './supplier-deposit-payment/supplier-deposit-payment-saga.entity';
import { SupplierDepositPaymentSagaService } from './supplier-deposit-payment/supplier-deposit-payment-saga.service';
import { SupplierDepositPaymentController } from './supplier-deposit-payment/supplier-deposit-payment.controller';
import { FundSwapsService } from './fund-swaps/fund-swaps.service';
import { FundSwapsController } from './fund-swaps/fund-swaps.controller';
import { DepositTransferEntity } from './deposit-transfer/deposit-transfer.entity';
import { DepositTransferService } from './deposit-transfer/deposit-transfer.service';
import { DepositTransferController } from './deposit-transfer/deposit-transfer.controller';
import { CashTransferEntity } from './cash-transfer/cash-transfer.entity';
import { CashTransferService } from './cash-transfer/cash-transfer.service';
import { CashTransferController } from './cash-transfer/cash-transfer.controller';
import { DepositDashboardService } from './deposit-dashboard/deposit-dashboard.service';
import { DepositDashboardController } from './deposit-dashboard/deposit-dashboard.controller';
import { DepositVoucherV2Controller } from './controllers/deposit-voucher-v2.controller';
import { SearchDepositVouchersV2Handler } from './queries/search-deposit-vouchers-v2.handler';

/**
 * Deposit vouchers (Phiếu thu/chi tiền gửi) — GĐ2. Document-level receipt/payment
 * vouchers on top of the GĐ1 deposit fund (DepositService). Mirrors CashVouchersModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankReceiptEntity,
      BankReceiptLineEntity,
      BankPaymentEntity,
      BankPaymentLineEntity,
      SupplierDepositPaymentSagaEntity,
      DepositTransferEntity,
      CashTransferEntity,
      DepositAccountEntity,
      BranchEntity,
      BankEntity,
    ]),
    DepositModule,
    DocumentNumberingModule,
    PaymentAccountsModule,
    CashModule,
    CashVouchersModule,
    CqrsModule,
  ],
  controllers: [
    DepositVoucherV2Controller,
    BankReceiptsController,
    BankPaymentsController,
    SupplierDepositPaymentController,
    FundSwapsController,
    // DepositDashboardController's static `deposit-transfers/in-transit` route
    // MUST be registered before DepositTransferController's `deposit-transfers/:id`
    // — Nest/Express match routes in registration order, so the parameterized
    // route would otherwise swallow `/in-transit` as an :id (uuid validation fails).
    DepositDashboardController,
    DepositTransferController,
    CashTransferController,
  ],
  providers: [
    BankReceiptsService,
    BankPaymentsService,
    PartnerResolverService,
    SupplierDepositPaymentSagaService,
    FundSwapsService,
    DepositTransferService,
    CashTransferService,
    DepositDashboardService,
    SearchDepositVouchersV2Handler,
  ],
  exports: [BankReceiptsService, BankPaymentsService],
})
export class DepositVouchersModule {}
