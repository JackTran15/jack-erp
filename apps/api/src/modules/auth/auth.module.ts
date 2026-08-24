import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserEntity } from "./user.entity";
import { RoleEntity } from "./role.entity";
import { PermissionEntity } from "./permission.entity";
import { UserRoleEntity } from "./user-role.entity";
import { RolePermissionEntity } from "./role-permission.entity";
import { UserBranchAssignmentEntity } from "../branch/user-branch-assignment.entity";
import { BranchEntity } from "../branch/branch.entity";
import { RbacModule } from "../rbac/rbac.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { HandoffStore } from "./handoff.store";

@Module({
  imports: [
    RbacModule,
    TypeOrmModule.forFeature([
      UserEntity,
      RoleEntity,
      PermissionEntity,
      UserRoleEntity,
      RolePermissionEntity,
      UserBranchAssignmentEntity,
      // Read-only: resolveUserBranches must know which branches still operate.
      BranchEntity,
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, HandoffStore],
  exports: [AuthService],
})
export class AuthModule {}
