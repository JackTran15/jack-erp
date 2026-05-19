import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../auth/user.entity';
import { UserRoleEntity } from '../auth/user-role.entity';
import { RoleEntity } from '../auth/role.entity';
import { RolePermissionEntity } from '../auth/role-permission.entity';
import { PermissionEntity } from '../auth/permission.entity';
import { UserBranchAssignmentEntity } from '../branch/user-branch-assignment.entity';
import { BranchEntity } from '../branch/branch.entity';
import { RbacService } from './rbac.service';
import { PermissionGuard } from './permission.guard';
import { BranchScopeGuard } from './branch-scope.guard';
import { PermissionSyncService } from './permission-sync.service';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { PermissionsController } from './permissions.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      UserRoleEntity,
      RoleEntity,
      RolePermissionEntity,
      PermissionEntity,
      UserBranchAssignmentEntity,
      BranchEntity,
    ]),
  ],
  controllers: [UsersController, RolesController, PermissionsController],
  providers: [
    RbacService,
    PermissionGuard,
    BranchScopeGuard,
    PermissionSyncService,
    UsersService,
    RolesService,
  ],
  exports: [RbacService, PermissionGuard, BranchScopeGuard],
})
export class RbacModule {}
