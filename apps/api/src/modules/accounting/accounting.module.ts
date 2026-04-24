import { Module } from '@nestjs/common';
import { CoaModule } from './coa/coa.module';
import { JournalModule } from './journal/journal.module';
import { PayablesModule } from './payables/payables.module';
import { ReceivablesModule } from './receivables/receivables.module';
import { ExpensesModule } from './expenses/expenses.module';
import { CashModule } from './cash/cash.module';

@Module({
  imports: [
    CoaModule,
    JournalModule,
    PayablesModule,
    ReceivablesModule,
    ExpensesModule,
    CashModule,
  ],
  exports: [
    CoaModule,
    JournalModule,
    PayablesModule,
    ReceivablesModule,
    ExpensesModule,
    CashModule,
  ],
})
export class AccountingModule {}
