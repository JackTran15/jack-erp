import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalModule } from '../journal/journal.module';
import { CashModule } from '../cash/cash.module';
import { EntityRegistryService } from '../../crud/entity-registry.service';
import { ExpenseEntity } from './expense.entity';
import {
  ExpensesService,
  EXPENSE_SERVICE_TOKEN,
  EXPENSE_ENTITY_CONFIG,
} from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { ExpenseVoucherLinkConsumer } from './consumers/expense-voucher-link.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExpenseEntity]),
    JournalModule,
    CashModule,
  ],
  controllers: [ExpensesController],
  providers: [
    ExpensesService,
    { provide: EXPENSE_SERVICE_TOKEN, useExisting: ExpensesService },
    ExpenseVoucherLinkConsumer,
  ],
  exports: [ExpensesService],
})
export class ExpensesModule implements OnModuleInit {
  constructor(private readonly entityRegistry: EntityRegistryService) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(
      EXPENSE_ENTITY_CONFIG,
      EXPENSE_SERVICE_TOKEN,
    );
  }
}
