import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityRegistryService } from '../crud/entity-registry.service';
import { ApiKeyEntity } from './api-key.entity';
import { BranchEntity } from '../branch/branch.entity';
import { UserEntity } from '../auth/user.entity';
import { UserRoleEntity } from '../auth/user-role.entity';
import { RoleEntity } from '../auth/role.entity';
import {
  ApiKeyCrudService,
  API_KEY_SERVICE_TOKEN,
  API_KEY_ENTITY_CONFIG,
} from './api-key-crud.service';
import { ApiKeyAuthService } from './api-key-auth.service';

/**
 * Registers `api-keys` with the generic CRUD platform (admin create/list/
 * revoke) and exports `ApiKeyAuthService` for `AuthGuard` to consume.
 * `BranchEntity`/`UserEntity`/`UserRoleEntity`/`RoleEntity` are registered
 * here too (not by importing `BranchModule`/`RbacModule`, which pull in
 * unrelated dependency chains) purely so `ApiKeyAuthService` can resolve an
 * unrestricted key's full branch list, and `ApiKeyCrudService` can manage
 * each key's shadow user (ADR-04, 03-logical-design.md). `RbacService`
 * itself needs no explicit import — `RbacModule` is `@Global()`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApiKeyEntity,
      BranchEntity,
      UserEntity,
      UserRoleEntity,
      RoleEntity,
    ]),
  ],
  providers: [
    ApiKeyCrudService,
    { provide: API_KEY_SERVICE_TOKEN, useExisting: ApiKeyCrudService },
    ApiKeyAuthService,
  ],
  exports: [ApiKeyCrudService, ApiKeyAuthService],
})
export class ApiKeyModule implements OnModuleInit {
  constructor(private readonly entityRegistry: EntityRegistryService) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(
      API_KEY_ENTITY_CONFIG,
      API_KEY_SERVICE_TOKEN,
    );
  }
}
