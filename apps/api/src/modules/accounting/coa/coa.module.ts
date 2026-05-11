import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityRegistryService } from '../../crud/entity-registry.service';
import { AccountEntity } from './account.entity';
import {
  CoaService,
  ACCOUNT_SERVICE_TOKEN,
  ACCOUNT_ENTITY_CONFIG,
} from './coa.service';
import { CoaController } from './coa.controller';
import { CoaSeederService } from '../seeders/coa-seeder.service';

@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity])],
  controllers: [CoaController],
  providers: [
    CoaService,
    { provide: ACCOUNT_SERVICE_TOKEN, useExisting: CoaService },
    CoaSeederService,
  ],
  exports: [CoaService, CoaSeederService],
})
export class CoaModule implements OnModuleInit {
  constructor(
    private readonly entityRegistry: EntityRegistryService,
  ) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(
      ACCOUNT_ENTITY_CONFIG,
      ACCOUNT_SERVICE_TOKEN,
    );
  }
}
