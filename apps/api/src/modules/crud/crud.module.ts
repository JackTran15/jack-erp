import { Global, Module } from '@nestjs/common';
import { EntityRegistryService } from './entity-registry.service';
import { CrudController } from './crud.controller';
import { AuditInterceptor } from './audit.interceptor';

@Global()
@Module({
  controllers: [CrudController],
  providers: [EntityRegistryService, AuditInterceptor],
  exports: [EntityRegistryService],
})
export class CrudModule {}
