import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRoleEntity } from '../auth/user-role.entity';
import { RolePermissionEntity } from '../auth/role-permission.entity';
import { PermissionEntity } from '../auth/permission.entity';
import { RbacService } from './rbac.service';
import { PermissionGuard } from './permission.guard';
import { BranchScopeGuard } from './branch-scope.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserRoleEntity,
      RolePermissionEntity,
      PermissionEntity,
    ]),
  ],
  providers: [RbacService, PermissionGuard, BranchScopeGuard],
  exports: [RbacService, PermissionGuard, BranchScopeGuard],
})
export class RbacModule {}
