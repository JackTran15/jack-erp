import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { JournalModule } from '../journal/journal.module';
import { CashModule } from '../cash/cash.module';
import { CashVouchersModule } from '../cash-vouchers/cash-vouchers.module';
import { EntityRegistryService } from '../../crud/entity-registry.service';
import { ReceivableEntity } from './receivable.entity';
import { ReceivableSettlementEntity } from './receivable-settlement.entity';
import {
  ReceivablesService,
  RECEIVABLE_SERVICE_TOKEN,
  RECEIVABLE_ENTITY_CONFIG,
} from './receivables.service';
import { ReceivablesController } from './receivables.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReceivableEntity, ReceivableSettlementEntity]),
    DocumentNumberingModule,
    JournalModule,
    CashModule,
    CashVouchersModule,
  ],
  controllers: [ReceivablesController],
  providers: [
    ReceivablesService,
    { provide: RECEIVABLE_SERVICE_TOKEN, useExisting: ReceivablesService },
  ],
  exports: [ReceivablesService],
})
export class ReceivablesModule implements OnModuleInit {
  constructor(private readonly entityRegistry: EntityRegistryService) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(
      RECEIVABLE_ENTITY_CONFIG,
      RECEIVABLE_SERVICE_TOKEN,
    );
  }
}
