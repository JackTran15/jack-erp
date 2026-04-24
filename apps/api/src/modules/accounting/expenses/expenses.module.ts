import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalModule } from '../journal/journal.module';
import { EntityRegistryService } from '../../crud/entity-registry.service';
import { ExpenseEntity } from './expense.entity';
import {
  ExpensesService,
  EXPENSE_SERVICE_TOKEN,
  EXPENSE_ENTITY_CONFIG,
} from './expenses.service';
import { ExpensesController } from './expenses.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExpenseEntity]),
    JournalModule,
  ],
  controllers: [ExpensesController],
  providers: [
    ExpensesService,
    { provide: EXPENSE_SERVICE_TOKEN, useExisting: ExpensesService },
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
