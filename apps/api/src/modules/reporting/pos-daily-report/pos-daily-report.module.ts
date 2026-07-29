import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceEntity } from '../../pos/entities/invoice.entity';
import { InvoiceItemEntity } from '../../pos/entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../../pos/entities/invoice-payment.entity';
import { InvoiceDebtEntity } from '../../pos/entities/invoice-debt.entity';
import { DebtPaymentEntity } from '../../pos/entities/debt-payment.entity';
import { InvoicePromotionEntity } from '../../promotion/invoice-promotion.entity';
import { CashPaymentEntity } from '../../accounting/cash-vouchers/cash-payments/cash-payment.entity';
import { CashReceiptEntity } from '../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import { PaymentAccountEntity } from '../../accounting/payment-accounts/payment-account.entity';
import { CashAccountEntity } from '../../accounting/cash/cash-account.entity';
import { DepositAccountEntity } from '../../accounting/deposit/deposit-account.entity';
import { AccountEntity } from '../../accounting/coa/account.entity';
import { CustomerEntity } from '../../customer/customer.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { UserEntity } from '../../auth/user.entity';
import { RbacModule } from '../../rbac/rbac.module';
import { PosDailyReportController } from './pos-daily-report.controller';
import { GetPosDailySummaryHandler } from './queries/get-pos-daily-summary.handler';
import { GetPosDailySummaryDetailHandler } from './queries/get-pos-daily-summary-detail.handler';
import { PosDailySummaryExportService } from './pos-daily-summary-export.service';

@Module({
  imports: [
    CqrsModule,
    RbacModule,
    TypeOrmModule.forFeature([
      InvoiceEntity,
      InvoiceItemEntity,
      InvoicePaymentEntity,
      InvoiceDebtEntity,
      DebtPaymentEntity,
      InvoicePromotionEntity,
      CashPaymentEntity,
      CashReceiptEntity,
      PaymentAccountEntity,
      CashAccountEntity,
      DepositAccountEntity,
      AccountEntity,
      CustomerEntity,
      BranchEntity,
      UserEntity,
    ]),
  ],
  controllers: [PosDailyReportController],
  providers: [
    GetPosDailySummaryHandler,
    GetPosDailySummaryDetailHandler,
    PosDailySummaryExportService,
  ],
})
export class PosDailyReportModule {}
