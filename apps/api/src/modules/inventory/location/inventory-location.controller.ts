import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PaginationQueryDto } from '../../crud/dto';
import { InventoryLocationService } from './inventory-location.service';
import {
  CreateItemDto,
  UpdateItemDto,
  CreateStorageDto,
  UpdateStorageDto,
  CreateShowroomDto,
  UpdateShowroomDto,
  CreateLocationDto,
  UpdateLocationDto,
  AssignStorageManagerDto,
  UnassignStorageManagerDto,
} from './dto';

@Controller('inventory')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class InventoryLocationController {
  constructor(private readonly service: InventoryLocationService) {}

  // ─── Items (org-scoped, no branch required) ───────────────────────

  @Post('items')
  @RequirePermission('inventory.write')
  createItem(
    @Body() dto: CreateItemDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.createItem(dto, actor);
  }

  @Get('items')
  @RequirePermission('inventory.read')
  listItems(
    @Query() query: PaginationQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.listItems(query, actor);
  }

  @Get('items/:id')
  @RequirePermission('inventory.read')
  getItemById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getItemById(id, actor);
  }

  @Patch('items/:id')
  @RequirePermission('inventory.write')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateItemDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.updateItem(id, dto, actor);
  }

  // ─── Storages (branch-scoped) ─────────────────────────────────────

  @Post('storages')
  @RequirePermission('inventory.write')
  @RequireBranchScope()
  createStorage(
    @Body() dto: CreateStorageDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.createStorage(dto, actor);
  }

  @Get('storages')
  @RequirePermission('inventory.read')
  listStorages(
    @Query() query: PaginationQueryDto & { branchId?: string },
    @Actor() actor: ActorContext,
  ) {
    return this.service.listStorages(query, actor);
  }

  @Get('storages/:id')
  @RequirePermission('inventory.read')
  getStorageById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getStorageById(id, actor);
  }

  @Patch('storages/:id')
  @RequirePermission('inventory.write')
  updateStorage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStorageDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.updateStorage(id, dto, actor);
  }

  // ─── Showrooms (branch-scoped, under storage) ─────────────────────

  @Post('showrooms')
  @RequirePermission('inventory.write')
  @RequireBranchScope()
  createShowroom(
    @Body() dto: CreateShowroomDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.createShowroom(dto, actor);
  }

  @Get('showrooms')
  @RequirePermission('inventory.read')
  listShowrooms(
    @Query() query: PaginationQueryDto & { branchId?: string; storageId?: string },
    @Actor() actor: ActorContext,
  ) {
    return this.service.listShowrooms(query, actor);
  }

  @Get('showrooms/:id')
  @RequirePermission('inventory.read')
  getShowroomById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getShowroomById(id, actor);
  }

  @Patch('showrooms/:id')
  @RequirePermission('inventory.write')
  updateShowroom(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShowroomDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.updateShowroom(id, dto, actor);
  }

  // ─── Locations (branch-scoped, under storage) ─────────────────────

  @Post('locations')
  @RequirePermission('inventory.write')
  @RequireBranchScope()
  createLocation(
    @Body() dto: CreateLocationDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.createLocation(dto, actor);
  }

  @Get('locations')
  @RequirePermission('inventory.read')
  listLocations(
    @Query() query: PaginationQueryDto & { storageId?: string; branchId?: string },
    @Actor() actor: ActorContext,
  ) {
    return this.service.listLocations(query, actor);
  }

  @Get('locations/:id')
  @RequirePermission('inventory.read')
  getLocationById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getLocationById(id, actor);
  }

  @Patch('locations/:id')
  @RequirePermission('inventory.write')
  updateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.updateLocation(id, dto, actor);
  }

  // ─── Storage Manager Assignments (branch-scoped) ──────────────────

  @Post('branches/:branchId/storage-managers/assign')
  @RequirePermission('inventory.manage')
  @RequireBranchScope()
  assignStorageManager(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: AssignStorageManagerDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.assignStorageManager(branchId, dto, actor);
  }

  @Post('branches/:branchId/storage-managers/unassign')
  @RequirePermission('inventory.manage')
  @RequireBranchScope()
  unassignStorageManager(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UnassignStorageManagerDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.unassignStorageManager(branchId, dto, actor);
  }

  @Get('branches/:branchId/storage-managers')
  @RequirePermission('inventory.read')
  @RequireBranchScope()
  listStorageManagers(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: PaginationQueryDto & { storageId?: string },
    @Actor() actor: ActorContext,
  ) {
    return this.service.listStorageManagers(branchId, query, actor);
  }
}
