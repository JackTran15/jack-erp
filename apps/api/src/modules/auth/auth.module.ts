import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserEntity } from "./user.entity";
import { RoleEntity } from "./role.entity";
import { PermissionEntity } from "./permission.entity";
import { UserRoleEntity } from "./user-role.entity";
import { RolePermissionEntity } from "./role-permission.entity";
import { UserBranchAssignmentEntity } from "../branch/user-branch-assignment.entity";
import { RbacModule } from "../rbac/rbac.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";

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
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
