import { Global, Module } from '@nestjs/common';
import { EntityRegistryService } from './entity-registry.service';
import { CrudController } from './crud.controller';
import { AuditInterceptor } from './audit.interceptor';
import { CrudPermissionGuard } from './crud-permission.guard';

@Global()
@Module({
  controllers: [CrudController],
  providers: [EntityRegistryService, AuditInterceptor, CrudPermissionGuard],
  exports: [EntityRegistryService],
})
export class CrudModule {}
