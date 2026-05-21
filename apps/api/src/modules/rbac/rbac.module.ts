import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../auth/user.entity';
import { UserRoleEntity } from '../auth/user-role.entity';
import { RoleEntity } from '../auth/role.entity';
import { RolePermissionEntity } from '../auth/role-permission.entity';
import { PermissionEntity } from '../auth/permission.entity';
import { UserBranchAssignmentEntity } from '../branch/user-branch-assignment.entity';
import { BranchEntity } from '../branch/branch.entity';
import { JobPositionEntity } from '../hr/job-position/job-position.entity';
import { EmployeeProfileEntity } from './employee/employee-profile.entity';
import { EmployeeAddressEntity } from './employee/employee-address.entity';
import { EmployeeEmergencyContactEntity } from './employee/employee-emergency-contact.entity';
import { EmployeeAccessScheduleEntity } from './employee/employee-access-schedule.entity';
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
      JobPositionEntity,
      EmployeeProfileEntity,
      EmployeeAddressEntity,
      EmployeeEmergencyContactEntity,
      EmployeeAccessScheduleEntity,
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
