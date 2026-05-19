import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  PaginationQuery,
  PaginatedResponse,
  UserSummary,
  UserDetail,
  UserRolesResponse,
  UserBranchesResponse,
} from '@erp/shared-interfaces';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../auth/decorators';
import { PermissionGuard } from './permission.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetUserRolesDto } from './dto/set-user-roles.dto';
import { SetUserBranchesDto } from './dto/set-user-branches.dto';

@Controller('admin/users')
@UseGuards(PermissionGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('iam.user.read')
  list(
    @Query()
    query: PaginationQuery & { search?: string; isActive?: string },
    @Actor() actor: ActorContext,
  ): Promise<PaginatedResponse<UserSummary>> {
    const isActive =
      query.isActive === 'true'
        ? true
        : query.isActive === 'false'
          ? false
          : undefined;
    return this.users.list(
      {
        page: Number(query.page) || 1,
        pageSize: Number(query.pageSize) || 20,
        search: query.search,
        isActive,
      },
      actor,
    );
  }

  @Get(':id')
  @RequirePermission('iam.user.read')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<UserDetail> {
    return this.users.findById(id, actor);
  }

  @Post()
  @RequirePermission('iam.user.write')
  create(
    @Body() dto: CreateUserDto,
    @Actor() actor: ActorContext,
  ): Promise<UserDetail> {
    return this.users.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission('iam.user.write')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Actor() actor: ActorContext,
  ): Promise<UserDetail> {
    return this.users.update(id, dto, actor);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('iam.user.write')
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    await this.users.resetPassword(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('iam.user.delete')
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    await this.users.deactivate(id, actor);
  }

  // ---------------------------------------------------------------------------
  // Role + branch assignments (nested under the user resource)
  // ---------------------------------------------------------------------------

  @Get(':id/roles')
  @RequirePermission('iam.user.read')
  async getUserRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<UserRolesResponse> {
    const roleIds = await this.users.getRoleIds(id, actor);
    return { roleIds };
  }

  /** Replaces the entire role set for the user. */
  @Post(':id/roles')
  @RequirePermission('iam.user.roles.write')
  async setUserRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserRolesDto,
    @Actor() actor: ActorContext,
  ): Promise<UserRolesResponse> {
    const roleIds = await this.users.setRoles(id, dto.roleIds, actor);
    return { roleIds };
  }

  @Get(':id/branches')
  @RequirePermission('iam.user.read')
  async getUserBranches(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<UserBranchesResponse> {
    const branchIds = await this.users.getBranchIds(id, actor);
    return { branchIds };
  }

  /** Replaces the entire branch assignment set for the user. */
  @Post(':id/branches')
  @RequirePermission('iam.user.branches.write')
  async setUserBranches(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserBranchesDto,
    @Actor() actor: ActorContext,
  ): Promise<UserBranchesResponse> {
    const branchIds = await this.users.setBranches(id, dto.branchIds, actor);
    return { branchIds };
  }
}
