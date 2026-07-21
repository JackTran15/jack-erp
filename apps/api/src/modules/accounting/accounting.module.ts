import { Module } from '@nestjs/common';
import { CoaModule } from './coa/coa.module';
import { JournalModule } from './journal/journal.module';
import { PayablesModule } from './payables/payables.module';
import { ReceivablesModule } from './receivables/receivables.module';
import { ExpensesModule } from './expenses/expenses.module';
import { CashModule } from './cash/cash.module';
import { CashVouchersModule } from './cash-vouchers/cash-vouchers.module';
import { PaymentAccountsModule } from './payment-accounts/payment-accounts.module';
import { DepositModule } from './deposit/deposit.module';
import { DepositVouchersModule } from './deposit-vouchers/deposit-vouchers.module';
import { DepositReconModule } from './deposit-recon/deposit-recon.module';
import { DepositAuditModule } from './deposit-audit/deposit-audit.module';
import { DepositPeriodLockModule } from './deposit-period-lock/deposit-period-lock.module';
import { DepositRefundModule } from './deposit-refund/deposit-refund.module';

@Module({
  imports: [
    CoaModule,
    JournalModule,
    PayablesModule,
    ReceivablesModule,
    ExpensesModule,
    CashModule,
    CashVouchersModule,
    PaymentAccountsModule,
    DepositModule,
    DepositVouchersModule,
    DepositReconModule,
    DepositAuditModule,
    DepositPeriodLockModule,
    DepositRefundModule,
  ],
  exports: [
    CoaModule,
    JournalModule,
    PayablesModule,
    ReceivablesModule,
    ExpensesModule,
    CashModule,
    CashVouchersModule,
    PaymentAccountsModule,
    DepositModule,
    DepositVouchersModule,
    DepositReconModule,
    DepositAuditModule,
    DepositPeriodLockModule,
    DepositRefundModule,
  ],
})
export class AccountingModule {}
