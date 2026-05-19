import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { RoleSummary, RoleDetail } from '@erp/shared-interfaces';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../auth/decorators';
import { PermissionGuard } from './permission.guard';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';

@Controller('admin/roles')
@UseGuards(PermissionGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermission('iam.role.read')
  list(@Actor() actor: ActorContext): Promise<RoleSummary[]> {
    return this.roles.list(actor);
  }

  @Get(':id')
  @RequirePermission('iam.role.read')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<RoleDetail> {
    return this.roles.findById(id, actor);
  }

  @Post()
  @RequirePermission('iam.role.write')
  create(
    @Body() dto: CreateRoleDto,
    @Actor() actor: ActorContext,
  ): Promise<RoleDetail> {
    return this.roles.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission('iam.role.write')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @Actor() actor: ActorContext,
  ): Promise<RoleDetail> {
    return this.roles.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('iam.role.delete')
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    await this.roles.delete(id, actor);
  }

  /** Replaces the entire permission set for the role. */
  @Put(':id/permissions')
  @RequirePermission('iam.role.permissions.write')
  setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolePermissionsDto,
    @Actor() actor: ActorContext,
  ): Promise<RoleDetail> {
    return this.roles.setPermissions(id, dto.permissionKeys, actor);
  }
}
