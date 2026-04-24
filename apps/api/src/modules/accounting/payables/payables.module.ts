import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { JournalModule } from '../journal/journal.module';
import { EntityRegistryService } from '../../crud/entity-registry.service';
import { PayableEntity } from './payable.entity';
import { PayableSettlementEntity } from './payable-settlement.entity';
import {
  PayablesService,
  PAYABLE_SERVICE_TOKEN,
  PAYABLE_ENTITY_CONFIG,
} from './payables.service';
import { PayablesController } from './payables.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PayableEntity, PayableSettlementEntity]),
    DocumentNumberingModule,
    JournalModule,
  ],
  controllers: [PayablesController],
  providers: [
    PayablesService,
    { provide: PAYABLE_SERVICE_TOKEN, useExisting: PayablesService },
  ],
  exports: [PayablesService],
})
export class PayablesModule implements OnModuleInit {
  constructor(private readonly entityRegistry: EntityRegistryService) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(
      PAYABLE_ENTITY_CONFIG,
      PAYABLE_SERVICE_TOKEN,
    );
  }
}
