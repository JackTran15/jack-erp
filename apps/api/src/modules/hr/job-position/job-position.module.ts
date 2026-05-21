import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityRegistryService } from '../../crud/entity-registry.service';
import { JobPositionEntity } from './job-position.entity';
import {
  JobPositionCrudService,
  JOB_POSITION_SERVICE_TOKEN,
  JOB_POSITION_ENTITY_CONFIG,
} from './job-position-crud.service';

/** Registers `job-positions` with the generic CRUD platform (list page + dropdown source). */
@Module({
  imports: [TypeOrmModule.forFeature([JobPositionEntity])],
  providers: [
    JobPositionCrudService,
    { provide: JOB_POSITION_SERVICE_TOKEN, useExisting: JobPositionCrudService },
  ],
  exports: [JobPositionCrudService],
})
export class JobPositionModule implements OnModuleInit {
  constructor(private readonly entityRegistry: EntityRegistryService) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(
      JOB_POSITION_ENTITY_CONFIG,
      JOB_POSITION_SERVICE_TOKEN,
    );
  }
}
